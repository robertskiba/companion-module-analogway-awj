/**
 * Composes a Screen thumbnail from the snapshots of the outputs that form it. The device has no snapshot of a
 * Screen itself (`/api/device/snapshots/screens/...` answers "Invalid parameter type"), but every output reports
 * where it sits in its Screen's canvas (`outputList/items/{n}/canvas/status/pp`: left, top, clampedWidth,
 * clampedHeight) - already accounting for grid spacing and soft-edge overlap. So the outputs are laid out at
 * those positions, at the snapshots' own resolution, and the result is then scaled down to thumbnail size.
 *
 * Plain Node (zlib) PNG handling - the device delivers 8-bit RGB/RGBA, non-interlaced PNGs, which is all this
 * decodes.
 */
import zlib from 'zlib'

export type RgbaImage = { width: number, height: number, data: Buffer }

/** One output of a Screen: its place in the Screen canvas (device pixels) and its snapshot. */
export type PlacedSnapshot = { left: number, top: number, width: number, height: number, image: RgbaImage }

export function decodePng(buf: Buffer): RgbaImage {
	if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
	let pos = 8
	let width = 0
	let height = 0
	let bitDepth = 0
	let colorType = 0
	let interlace = 0
	const idat: Buffer[] = []
	while (pos + 8 <= buf.length) {
		const len = buf.readUInt32BE(pos)
		const type = buf.toString('ascii', pos + 4, pos + 8)
		const data = buf.subarray(pos + 8, pos + 8 + len)
		if (type === 'IHDR') {
			width = data.readUInt32BE(0)
			height = data.readUInt32BE(4)
			bitDepth = data[8]
			colorType = data[9]
			interlace = data[12]
		} else if (type === 'IDAT') {
			idat.push(data)
		} else if (type === 'IEND') {
			break
		}
		pos += 12 + len
	}
	const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
	if (bpp === 0 || bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (color type ${colorType}, depth ${bitDepth}, interlace ${interlace})`)

	const raw = zlib.inflateSync(Buffer.concat(idat))
	const stride = width * bpp
	const out = Buffer.alloc(width * height * 4)
	let prev = Buffer.alloc(stride)
	for (let y = 0; y < height; y++) {
		const start = y * (stride + 1)
		const filter = raw[start]
		const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride))
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? line[x - bpp] : 0
			const b = prev[x]
			const c = x >= bpp ? prev[x - bpp] : 0
			let predictor: number
			switch (filter) {
				case 0: predictor = 0; break
				case 1: predictor = a; break
				case 2: predictor = b; break
				case 3: predictor = (a + b) >> 1; break
				case 4: {
					const pa = Math.abs(b - c)
					const pb = Math.abs(a - c)
					const pc = Math.abs(a + b - 2 * c)
					predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
					break
				}
				default: throw new Error(`bad PNG filter ${filter}`)
			}
			line[x] = (line[x] + predictor) & 0xff
		}
		for (let x = 0; x < width; x++) {
			const o = (y * width + x) * 4
			const i = x * bpp
			out[o] = line[i]
			out[o + 1] = line[i + 1]
			out[o + 2] = line[i + 2]
			out[o + 3] = bpp === 4 ? line[i + 3] : 255
		}
		prev = line
	}
	return { width, height, data: out }
}

const crcTable = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

function crc32(buf: Buffer): number {
	let c = 0xffffffff
	for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

export function encodePng(image: RgbaImage): Buffer {
	const stride = image.width * 4
	const raw = Buffer.alloc((stride + 1) * image.height)
	for (let y = 0; y < image.height; y++) image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
	const chunk = (type: string, data: Buffer): Buffer => {
		const len = Buffer.alloc(4)
		len.writeUInt32BE(data.length)
		const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
		const crc = Buffer.alloc(4)
		crc.writeUInt32BE(crc32(typed))
		return Buffer.concat([len, typed, crc])
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(image.width, 0)
	ihdr.writeUInt32BE(image.height, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 6 // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	])
}

/**
 * Lays the outputs out in one image of the whole Screen, at the finest resolution any of the snapshots offers
 * (snapshot pixels per device pixel), so no detail is thrown away before the final scaling. Where outputs
 * overlap (soft edge), each pixel is taken from the output whose centre is nearest - a cut down the middle of
 * the overlap, which keeps each side's blend ramp out of the picture. Areas no output covers stay black.
 */
export function composeScreen(outputs: PlacedSnapshot[]): RgbaImage | undefined {
	const placed = outputs.filter((o) => o.width > 0 && o.height > 0 && o.image.width > 0 && o.image.height > 0)
	if (placed.length === 0) return undefined
	const minLeft = Math.min(...placed.map((o) => o.left))
	const minTop = Math.min(...placed.map((o) => o.top))
	const canvasW = Math.max(...placed.map((o) => o.left + o.width)) - minLeft
	const canvasH = Math.max(...placed.map((o) => o.top + o.height)) - minTop
	const scale = Math.max(...placed.map((o) => Math.max(o.image.width / o.width, o.image.height / o.height)))
	const width = Math.max(1, Math.round(canvasW * scale))
	const height = Math.max(1, Math.round(canvasH * scale))
	const data = Buffer.alloc(width * height * 4)
	for (let i = 3; i < data.length; i += 4) data[i] = 255

	for (let y = 0; y < height; y++) {
		const sy = (y + 0.5) / scale + minTop
		for (let x = 0; x < width; x++) {
			const sx = (x + 0.5) / scale + minLeft
			let owner: PlacedSnapshot | undefined
			let ownerDist = Infinity
			for (const o of placed) {
				if (sx < o.left || sx >= o.left + o.width || sy < o.top || sy >= o.top + o.height) continue
				const dist = Math.abs(sx - (o.left + o.width / 2)) / o.width + Math.abs(sy - (o.top + o.height / 2)) / o.height
				if (dist < ownerDist) {
					ownerDist = dist
					owner = o
				}
			}
			if (!owner) continue
			const px = Math.min(owner.image.width - 1, Math.floor(((sx - owner.left) / owner.width) * owner.image.width))
			const py = Math.min(owner.image.height - 1, Math.floor(((sy - owner.top) / owner.height) * owner.image.height))
			const si = (py * owner.image.width + px) * 4
			owner.image.data.copy(data, (y * width + x) * 4, si, si + 4)
		}
	}
	return { width, height, data }
}

/** Scales an image down so its longer side is at most `maxSide`, averaging every source pixel that falls into a
 *  target pixel (box filter) - much cleaner than picking single pixels. An image already small enough is
 *  returned unchanged. */
export function scaleDown(image: RgbaImage, maxSide: number): RgbaImage {
	const factor = Math.max(image.width, image.height) / maxSide
	if (factor <= 1) return image
	const width = Math.max(1, Math.round(image.width / factor))
	const height = Math.max(1, Math.round(image.height / factor))
	const data = Buffer.alloc(width * height * 4)
	for (let y = 0; y < height; y++) {
		const y0 = Math.floor((y * image.height) / height)
		const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height))
		for (let x = 0; x < width; x++) {
			const x0 = Math.floor((x * image.width) / width)
			const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width))
			let r = 0, g = 0, b = 0, a = 0
			for (let sy = y0; sy < y1; sy++) {
				for (let sx = x0; sx < x1; sx++) {
					const i = (sy * image.width + sx) * 4
					r += image.data[i]
					g += image.data[i + 1]
					b += image.data[i + 2]
					a += image.data[i + 3]
				}
			}
			const n = (y1 - y0) * (x1 - x0)
			const o = (y * width + x) * 4
			data[o] = Math.round(r / n)
			data[o + 1] = Math.round(g / n)
			data[o + 2] = Math.round(b / n)
			data[o + 3] = Math.round(a / n)
		}
	}
	return { width, height, data }
}
