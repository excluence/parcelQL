/* eslint-disable @typescript-eslint/no-unused-vars */
import knex, { Knex } from 'knex';
import { ParcelQLError, ParcelQLValidationError } from '../error';
import {
    ParcelQLColumn,
    ParcelQLFilter,
    ParcelQLHaving,
    ParcelQLJoin,
    ParcelQLOrderBy,
    ParcelQLQuery,
    ParcelQLSimpleColumn,
    queryActions
} from '../schema';
import { BaseQueryBuilder } from './base-query-builder';
import { ColumnQueryBuilder } from './colum-query-builder/column-query-builder';
import { FilterBuilder } from './filter-query-builder/filter-builder';
import { JoinBuilder } from './join-builder';
import { OrderByQueryBuilder } from './filter-query-builder/order-by-query-builder';

export class QueryBuilder
    extends BaseQueryBuilder<ParcelQLQuery, Knex.QueryBuilder>
    implements ParcelQLQuery
{
    public readonly action: 'query' | 'subquery' | 'temporary_table';
    public readonly table: string | ParcelQLQuery<'subquery'>;
    public readonly columns: ParcelQLColumn[];
    public readonly filter?: ParcelQLFilter | undefined;
    public readonly join?: ParcelQLJoin | undefined;
    public readonly group_by?: Omit<ParcelQLColumn, 'alias'>[] | undefined;
    public readonly having?: ParcelQLQuery['having'];
    public readonly order_by?: ParcelQLOrderBy;
    public readonly limit?: number | undefined;
    public readonly offset?: number | undefined;
    public readonly distinct?: ParcelQLQuery['distinct'];

    private colBuilders: ColumnQueryBuilder[] = [];
    public readonly isSubquery: boolean;

    constructor(
        public readonly query: ParcelQLQuery,
        isSubquery: boolean | undefined = undefined
    ) {
        super(query);
        this.action = query.action;
        this.isSubquery = !(!isSubquery && this.action === 'query');
        if (this.isSubquery && typeof query.table !== 'string') {
            throw new ParcelQLError(`only 1 level deep query allowed`);
        }
        this.table = query.table;
        this.columns = query.columns || [{ column: '*' }];
        this.filter = query.filter;
        this.join = query.join;
        this.group_by = query.group_by;
        this.having = query.having;
        this.order_by = query.order_by;
        this.limit = query.limit;
        this.offset = query.offset;
        this.distinct = query.distinct;
    }

    protected onInit(): void {
        if (!queryActions.includes(this.query.action)) {
            throw new ParcelQLValidationError(
                'query does not contains valid action'
            );
        }
        if (!this.query.table) {
            throw new ParcelQLValidationError(
                `table is required in the query.`
            );
        }
    }

    protected _beforeBuild(knex: Knex<any, any[]>): void {
        // Column builders created
        this.colBuilders = this.columns.map(
            (col) => new ColumnQueryBuilder(col)
        );
    }

    private _buildGroupBy(knex: Knex): Knex.Raw {
        if (!this.group_by)
            throw new Error(
                'group_by must be defined when calling this function'
            );
        const spots: string[] = [];
        const colBuilders = this.group_by.map((g) => {
            spots.push('?');
            return new ColumnQueryBuilder(g);
        });
        return knex.raw(
            spots.join(','),
            colBuilders.map((c) => c.build(knex))
        );
    }

    protected _buildDistinct(knex: Knex): Knex.Raw {
        if (!this.distinct)
            throw new Error(
                'distinct must be defined when calling this function'
            );
        const spot: string[] = [];
        const colBuilds = this.distinct.columns.map((col) => {
            spot.push('?');
            const builders = new ColumnQueryBuilder(col);
            return builders.build(knex);
        });
        if (this.distinct.on) {
            const onColBuilder = new ColumnQueryBuilder(this.distinct.on);
            return knex.raw(
                `DISTINCT ON (?) ${spot.join(', ')}`,
                [onColBuilder.build(knex)].concat(colBuilds)
            );
        }
        return knex.raw(`DISTINCT ${spot.join(', ')}`, colBuilds);
    }

    protected _build(knex: Knex<any, any[]>): Knex.QueryBuilder {
        const selectBuilders = this.colBuilders.map((col) => col.build(knex));
        if (this.distinct) {
            selectBuilders.push(this._buildDistinct(knex));
        }
        const select = knex.select(selectBuilders);
        if (typeof this.table === 'string') {
            select.fromRaw(knex.raw('??', [this.table]));
        } else {
            const temporary_table = new QueryBuilder(
                {
                    ...this.table,
                    action: 'temporary_table'
                },
                true
            );
            // This will bind all data immediately instead of propagating it to parent bindings
            select.fromRaw(temporary_table.build(knex));
        }

        if (this.join) {
            const joinBuilder = new JoinBuilder(this.join);
            select.join(joinBuilder.build(knex));
        }

        if (this.filter) {
            const filterBuilder = new FilterBuilder(this.filter);
            select.where(filterBuilder.build(knex));
        }

        if (this.group_by) {
            select.groupBy(this._buildGroupBy(knex));
        }
        if (this.having) {
            const havingBuilder = new FilterBuilder(this.having);
            select.having(havingBuilder.build(knex));
        }
        if (this.order_by) {
            const orderByBuilder = new OrderByQueryBuilder(
                this.order_by,
                false
            );
            select.orderByRaw(orderByBuilder.build(knex));
        }

        if (this.limit) {
            select.limit(this.limit);
        }

        if (this.offset) {
            select.offset(this.offset);
        }
        return select;
    }
}
