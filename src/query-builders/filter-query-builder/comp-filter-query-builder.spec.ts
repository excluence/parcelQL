import { expect } from 'chai';
import _knex, { Knex } from 'knex';
import { CompFilterQueryBuilder } from './comp-filter-query-builder';

describe('Test CompFilterQueueBuilder', () => {
    let knex: Knex;

    before(() => {
        knex = _knex({
            client: 'sqlite3',
            connection: {
                filename: ':memory:'
            },
            useNullAsDefault: true
        });
    });

    after(async () => {
        await knex.destroy();
    });

    // Test invalid operator
    it('should throw error on invalid operator', () => {
        expect(() => {
            new CompFilterQueryBuilder({
                column: 'a',
                operator: '%' as any,
                value: 2
            });
        }).to.throw(`filter operator "%" is not supported.`);
    });
    // Test with valid operator
    it('should pass', () => {
        const filterBuilder = new CompFilterQueryBuilder({
            column: 'a',
            operator: '>',
            value: 2
        });
        const sql = filterBuilder.build(knex).toSQL();
        expect(sql.sql).to.eq('`a` > ?');
        expect(sql.bindings).to.eql([2]);
    });
    // Test with rightColumn
    it('should pass with rightColumn', () => {
        const builder = new CompFilterQueryBuilder({
            column: 'a',
            operator: '>',
            rightColumn: {
                column: 'b'
            }
        });
        const sql = builder.build(knex).toSQL();
        expect(sql.sql).to.eq('`a` > `b`');
    });
    // Test using functions in column
    it('should pass using functions in comparison filter', () => {
        const builder = new CompFilterQueryBuilder({
            column: {
                function: 'COUNT',
                parameters: [
                    {
                        column: 'a',
                        type: 'integer'
                    }
                ]
            },
            operator: '>',
            value: 24
        });
        const sql = builder.build(knex).toSQL();
        expect(sql.sql).to.eq('COUNT(`a`::integer) > ?');
        expect(sql.bindings).to.eql([24]);
    });
    //TODO: Test NOT, LIKE, IN and other operators
});
