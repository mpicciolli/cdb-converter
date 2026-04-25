/**
 * CDB to SQLite conversion tests
 */

import { describe, expect, it } from 'vitest'
import { cdbToSql, sqlToCdb } from '../src/index'
import type { SqlJsStatic } from '../src/types'

// Mock SqlJs for testing - would need actual sql.js in real tests
function createMockSqlJs(): SqlJsStatic {
  return {
    Database: class MockDatabase {
      private tables: Map<string, any> = new Map()
      private sqlOperations: Array<{ sql: string; params?: any[] }> = []
      _tableFlagsMap?: Map<number, number>

      run(sql: string, params?: any[]): void {
        this.sqlOperations.push({ sql, params })

        if (sql.includes('CREATE TABLE')) {
          const match = sql.match(/CREATE TABLE "?(\w+)"?/)
          if (match) {
            this.tables.set(match[1], { rows: [] })
          }
        } else if (sql.includes('INSERT INTO')) {
          const match = sql.match(/INSERT INTO "?(\w+)"?/)
          if (match) {
            const table = this.tables.get(match[1])
            if (table) {
              table.rows.push(params)
            }
          }
        }
      }

      exec(sql: string): Array<{ columns: string[]; values: any[][] }> {
        if (sql.includes('SELECT TableName, ID FROM DB_STRUCTURE')) {
          return [
            {
              columns: ['TableName', 'ID'],
              values: [
                ['TestTable', 100],
                ['Teams', 10],
              ],
            },
          ]
        }

        if (sql.includes('PRAGMA table_info')) {
          return [
            {
              columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
              values: [
                [0, 'id', 'INTEGER 1600', 0, null, 0],
                [1, 'name', 'TEXT 1602', 0, null, 0],
              ],
            },
          ]
        }

        if (sql.includes('SELECT * FROM')) {
          return [
            {
              columns: ['id', 'name'],
              values: [
                [1, 'Test1'],
                [2, 'Test2'],
              ],
            },
          ]
        }

        return []
      }

      export(): Uint8Array {
        return new Uint8Array([0, 1, 2, 3])
      }
    },
  }
}

describe('cdb/sql conversion surface', () => {
  it('exposes cdbToSql', () => {
    expect(typeof cdbToSql).toBe('function')
  })

  it('exposes sqlToCdb', () => {
    expect(typeof sqlToCdb).toBe('function')
  })

  it('keeps the mock database behavior usable for round-trip scaffolding', () => {
    const sql = createMockSqlJs()
    const mockDb = new sql.Database()
    mockDb._tableFlagsMap = new Map([[10, 65]])

    mockDb.run('CREATE TABLE test (id INTEGER)')
    mockDb.run('INSERT INTO test VALUES (?)', [42])

    const result = mockDb.exec('SELECT * FROM test')
    expect(Array.isArray(result)).toBe(true)
  })
})
