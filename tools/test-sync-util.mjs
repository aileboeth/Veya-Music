// 同步工具函数的单元测试：node tools/test-sync-util.mjs（Node 23.6+ 直接运行 .ts）
import assert from 'node:assert/strict'
import { assignPositions, hashOf, sortByPositions, stable } from '../src/main/sync/util.ts'

const ids = ['a', 'b', 'c', 'd']
const p0 = assignPositions(ids, new Map())
assert.deepEqual([...p0.values()], [1, 2, 3, 4])

// 顶部加一首：原来的歌位置都不变（不会产生同步记录）
const p1 = assignPositions(['x', ...ids], p0)
for (const id of ids) assert.equal(p1.get(id), p0.get(id))
assert.ok(p1.get('x') < p0.get('a'))

// 末尾加、中间插
const p2 = assignPositions(['a', 'b', 'y', 'c', 'd', 'z'], p0)
for (const id of ids) assert.equal(p2.get(id), p0.get(id))
assert.ok(p2.get('b') < p2.get('y') && p2.get('y') < p2.get('c') && p2.get('z') > p2.get('d'))

// 挪动一首：只有它的位置变
const p3 = assignPositions(['c', 'a', 'b', 'd'], p0)
const changed = ids.filter(id => p3.get(id) != p0.get(id))
assert.deepEqual(changed, ['c'])
assert.deepEqual(sortByPositions(['a', 'b', 'c', 'd'], id => p3.get(id)), ['c', 'a', 'b', 'd'])

// 反复插在同一个位置几百次，顺序始终正确
let order = ['a', 'b']
let pos = assignPositions(order, new Map())
for (let i = 0; i < 300; i++) {
  order = ['a', 'n' + i, ...order.slice(1)]
  pos = assignPositions(order, pos)
  const sorted = sortByPositions([...order].reverse(), id => pos.get(id))
  assert.deepEqual(sorted, order)
}

// 没有位置的项跟在原来前面那一项后面
assert.deepEqual(sortByPositions(['q', 'a', 'new', 'b'], id => ({ a: 1, b: 2 })[id]), ['q', 'a', 'new', 'b'])

// 稳定序列化：键顺序、undefined 不影响哈希
assert.equal(stable({ b: 1, a: [1, { d: 2, c: undefined }] }), '{"a":[1,{"d":2}],"b":1}')
assert.equal(hashOf({ x: 1, y: 2 }), hashOf({ y: 2, x: 1 }))
assert.notEqual(hashOf({ x: 1 }), hashOf({ x: 2 }))
assert.equal(hashOf(null), '')
console.log('sync util tests: all passed')
