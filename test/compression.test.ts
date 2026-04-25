/**
 * Compression tests
 */

import { describe, expect, it } from 'vitest'
import { compressCdb, decompressCdb } from '../src/compression'
import { MAGIC } from '../src/tableMetadata'

// Uncompressed passthrough test data
const rawTestData = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
])

// Valid CDB-like payload for compression round-trip tests
const cdbPayload = new TextEncoder().encode('cyanide database test payload')

describe('compression', () => {
  it('round-trips compressed data', () => {
    const compressed = compressCdb(cdbPayload.buffer)
    const view = new DataView(compressed)

    expect(view.getUint32(0, true)).toBe(MAGIC.COMPRESSION_MAGIC)

    const decompressed = decompressCdb(compressed)
    const originalBytes = new Uint8Array(cdbPayload.buffer)
    const decompressedBytes = new Uint8Array(decompressed)

    expect(decompressedBytes.length).toBe(originalBytes.length)
    expect(Array.from(decompressedBytes)).toEqual(Array.from(originalBytes))
  })

  it('passes through already-uncompressed data', () => {
    const decompressed = decompressCdb(rawTestData.buffer)
    const decompressedBytes = new Uint8Array(decompressed)

    expect(decompressedBytes.length).toBe(rawTestData.length)
    expect(Array.from(decompressedBytes)).toEqual(Array.from(rawTestData))
  })

  it('writes the expected compression header', () => {
    const compressed = compressCdb(cdbPayload.buffer)
    const view = new DataView(compressed)

    expect(view.getUint32(0, true)).toBe(MAGIC.COMPRESSION_MAGIC)

    const uncompressedSize = view.getUint32(4, true)
    expect(uncompressedSize).toBe(cdbPayload.length)

    const compressedSize = view.getUint32(8, true)
    expect(compressedSize).toBeGreaterThan(0)
    expect(compressedSize).toBeLessThan(compressed.byteLength)
  })
})
