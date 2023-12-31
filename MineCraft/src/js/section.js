import { blockData, blockIds, Block } from "./blockData.js"
import { textureMap, textureCoords } from "./texture.js"
const { abs, max } = Math

function getBlock(x, y, z, blocks) {
	return blocks[((x >> 4) + 1) * 9 + ((y >> 4) + 1) * 3 + (z >> 4) + 1][((x & 15) << 8) + ((y & 15) << 4) + (z & 15)]
}

// this will be modified once exported to be
// open simplex noise
let noiseSettings = {}

// Save the coords for a small sphere used to carve out caves
let sphere
{
	let blocks = []
	let radius = 3.5
	let radsq = radius * radius
	for (let i = -radius; i <= radius; i++) {
		for (let j = -radius; j <= radius; j++) {
			for (let k = -radius; k <= radius; k++) {
				if (i*i + j*j + k*k < radsq) {
					blocks.push(i|0, j|0, k|0)
				}
			}
		}
	}
	sphere = new Int8Array(blocks)
}

function carveSphere(x, y, z, world) {
	if (y > 3) {
		for (let i = 0; i < sphere.length; i += 3) {
			world.setBlock(x + sphere[i], y + sphere[i + 1], z + sphere[i + 2], blockIds.air, true)
		}
	}
}

/**
 * Returns a 1 if the face is exposed and should be drawn, or a 0 if the face is hidden
 *
 * @param {number} x - The X coordinate of the block that may be covering a face
 * @param {number} y - The Y coordinate of the block that may be covering a face
 * @param {number} z - The Z coordinate of the block that may be covering a face
 * @param {Collection} blocks - Some collection of blocks that can return the block at (x, y, z)
 * @param {number} type - The blockstate of the block that's being considered for face culling
 * @param {function} func - The function that can be called to return a block from the blocks collection
 * @param {World} world - the world
*/
function hideFace(x, y, z, blocks, type, func, sourceDir, dir, world, screen) {
	let block = func.call(world, x, y, z, blocks)
	if (!block) {
		return 1
	}

	let data = blockData[block]
	let sourceData = blockData[type]

	let sourceRange = 3
	let hiderRange = 3
	if (func !== getBlock || screen === "loading") {
		// getBlock is only used during the optimize phase of worldGen
		sourceRange = sourceData.shape.cull[sourceDir]
		hiderRange = data.shape.cull[dir]
	}

	if ((sourceRange & hiderRange) !== sourceRange || sourceRange === 0 || block !== type && data.transparent || data.transparent && data.shadow) {
		return 1
	}
	return 0
}

let getShadows = {
	shade: [1, 0.85, 0.7, 0.6, 0.3],
	ret: [],
	blocks: [],
	top: function(x, y, z, block) { // Actually the bottom... How did these get flipped?
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x-1, y-1, z-1, block)].shadow
		blocks[1] = blockData[getBlock(x, y-1, z-1, block)].shadow
		blocks[2] = blockData[getBlock(x+1, y-1, z-1, block)].shadow
		blocks[3] = blockData[getBlock(x-1, y-1, z, block)].shadow
		blocks[4] = blockData[getBlock(x, y-1, z, block)].shadow
		blocks[5] = blockData[getBlock(x+1, y-1, z, block)].shadow
		blocks[6] = blockData[getBlock(x-1, y-1, z+1, block)].shadow
		blocks[7] = blockData[getBlock(x, y-1, z+1, block)].shadow
		blocks[8] = blockData[getBlock(x+1, y-1, z+1, block)].shadow

		ret[0] = this.shade[blocks[0] + blocks[1] + blocks[3] + blocks[4]]*0.75
		ret[1] = this.shade[blocks[1] + blocks[2] + blocks[4] + blocks[5]]*0.75
		ret[2] = this.shade[blocks[5] + blocks[4] + blocks[8] + blocks[7]]*0.75
		ret[3] = this.shade[blocks[4] + blocks[3] + blocks[7] + blocks[6]]*0.75
		return ret
	},
	bottom: function(x, y, z, block) { // Actually the top
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x-1, y+1, z-1, block)].shadow
		blocks[1] = blockData[getBlock(x, y+1, z-1, block)].shadow
		blocks[2] = blockData[getBlock(x+1, y+1, z-1, block)].shadow
		blocks[3] = blockData[getBlock(x-1, y+1, z, block)].shadow
		blocks[4] = blockData[getBlock(x, y+1, z, block)].shadow
		blocks[5] = blockData[getBlock(x+1, y+1, z, block)].shadow
		blocks[6] = blockData[getBlock(x-1, y+1, z+1, block)].shadow
		blocks[7] = blockData[getBlock(x, y+1, z+1, block)].shadow
		blocks[8] = blockData[getBlock(x+1, y+1, z+1, block)].shadow

		ret[0] = this.shade[blocks[4] + blocks[3] + blocks[7] + blocks[6]]
		ret[1] = this.shade[blocks[5] + blocks[4] + blocks[8] + blocks[7]]
		ret[2] = this.shade[blocks[1] + blocks[2] + blocks[4] + blocks[5]]
		ret[3] = this.shade[blocks[0] + blocks[1] + blocks[3] + blocks[4]]
		return ret
	},
	north: function(x, y, z, block) {
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x-1, y-1, z+1, block)].shadow
		blocks[1] = blockData[getBlock(x, y-1, z+1, block)].shadow
		blocks[2] = blockData[getBlock(x+1, y-1, z+1, block)].shadow
		blocks[3] = blockData[getBlock(x-1, y, z+1, block)].shadow
		blocks[4] = blockData[getBlock(x, y, z+1, block)].shadow
		blocks[5] = blockData[getBlock(x+1, y, z+1, block)].shadow
		blocks[6] = blockData[getBlock(x-1, y+1, z+1, block)].shadow
		blocks[7] = blockData[getBlock(x, y+1, z+1, block)].shadow
		blocks[8] = blockData[getBlock(x+1, y+1, z+1, block)].shadow

		ret[0] = this.shade[blocks[5] + blocks[4] + blocks[8] + blocks[7]]*0.95
		ret[1] = this.shade[blocks[4] + blocks[3] + blocks[7] + blocks[6]]*0.95
		ret[2] = this.shade[blocks[0] + blocks[1] + blocks[3] + blocks[4]]*0.95
		ret[3] = this.shade[blocks[1] + blocks[2] + blocks[4] + blocks[5]]*0.95
		return ret
	},
	south: function(x, y, z, block) {
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x-1, y-1, z-1, block)].shadow
		blocks[1] = blockData[getBlock(x-1, y, z-1, block)].shadow
		blocks[2] = blockData[getBlock(x-1, y+1, z-1, block)].shadow
		blocks[3] = blockData[getBlock(x, y-1, z-1, block)].shadow
		blocks[4] = blockData[getBlock(x, y, z-1, block)].shadow
		blocks[5] = blockData[getBlock(x, y+1, z-1, block)].shadow
		blocks[6] = blockData[getBlock(x+1, y-1, z-1, block)].shadow
		blocks[7] = blockData[getBlock(x+1, y, z-1, block)].shadow
		blocks[8] = blockData[getBlock(x+1, y+1, z-1, block)].shadow

		ret[0] = this.shade[blocks[1] + blocks[2] + blocks[4] + blocks[5]]*0.95
		ret[1] = this.shade[blocks[5] + blocks[4] + blocks[8] + blocks[7]]*0.95
		ret[2] = this.shade[blocks[4] + blocks[3] + blocks[7] + blocks[6]]*0.95
		ret[3] = this.shade[blocks[0] + blocks[1] + blocks[3] + blocks[4]]*0.95
		return ret
	},
	east: function(x, y, z, block) {
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x+1, y-1, z-1, block)].shadow
		blocks[1] = blockData[getBlock(x+1, y, z-1, block)].shadow
		blocks[2] = blockData[getBlock(x+1, y+1, z-1, block)].shadow
		blocks[3] = blockData[getBlock(x+1, y-1, z, block)].shadow
		blocks[4] = blockData[getBlock(x+1, y, z, block)].shadow
		blocks[5] = blockData[getBlock(x+1, y+1, z, block)].shadow
		blocks[6] = blockData[getBlock(x+1, y-1, z+1, block)].shadow
		blocks[7] = blockData[getBlock(x+1, y, z+1, block)].shadow
		blocks[8] = blockData[getBlock(x+1, y+1, z+1, block)].shadow

		ret[0] = this.shade[blocks[1] + blocks[2] + blocks[4] + blocks[5]]*0.8
		ret[1] = this.shade[blocks[5] + blocks[4] + blocks[8] + blocks[7]]*0.8
		ret[2] = this.shade[blocks[4] + blocks[3] + blocks[7] + blocks[6]]*0.8
		ret[3] = this.shade[blocks[0] + blocks[1] + blocks[3] + blocks[4]]*0.8
		return ret
	},
	west: function(x, y, z, block) {
		let blocks = this.blocks
		let ret = this.ret
		blocks[0] = blockData[getBlock(x-1, y-1, z-1, block)].shadow
		blocks[1] = blockData[getBlock(x-1, y, z-1, block)].shadow
		blocks[2] = blockData[getBlock(x-1, y+1, z-1, block)].shadow
		blocks[3] = blockData[getBlock(x-1, y-1, z, block)].shadow
		blocks[4] = blockData[getBlock(x-1, y, z, block)].shadow
		blocks[5] = blockData[getBlock(x-1, y+1, z, block)].shadow
		blocks[6] = blockData[getBlock(x-1, y-1, z+1, block)].shadow
		blocks[7] = blockData[getBlock(x-1, y, z+1, block)].shadow
		blocks[8] = blockData[getBlock(x-1, y+1, z+1, block)].shadow

		ret[0] = this.shade[blocks[7] + blocks[8] + blocks[4] + blocks[5]]*0.8
		ret[1] = this.shade[blocks[5] + blocks[4] + blocks[2] + blocks[1]]*0.8
		ret[2] = this.shade[blocks[4] + blocks[3] + blocks[1] + blocks[0]]*0.8
		ret[3] = this.shade[blocks[6] + blocks[7] + blocks[3] + blocks[4]]*0.8
		return ret
	},
}

function average(l, a, b, c, d) {
	a = l[a]
	b = l[b]
	c = l[c]
	d = l[d]
	let count = 1
	let zero = 0
	let total = a
	if (b && abs(a-b) <= 2) {
		total += b
		count++
	}
	else zero++
	if (c && abs(a-c) <= 2) {
		total += c
		count++
	}
	else zero++
	if (d && abs(a-d) <= 2) {
		total += d
		count++
	}
	else zero++

	let mx = max(a, b, c, d)
	if (mx > 2) {
		return total / (count * 15)
	}
	if (mx > 1) {
		return zero ? total / (count * 15 + 15) : total / (count * 15)
	}
	return total / 60
}

let getLight = {
	blocks: [],
	top: function(x, y, z, block, ret, blockLight = 0) { // Actually the bottom... How did these get flipped?
		let blocks = this.blocks
		blocks[0] = (getBlock(x-1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x+1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x-1, y-1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x, y-1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x+1, y-1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x-1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x+1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 0, 1, 3)
		ret[1] = average(blocks, 4, 1, 2, 5)
		ret[2] = average(blocks, 4, 5, 7, 8)
		ret[3] = average(blocks, 4, 3, 6, 7)
		// debugger
		return ret
	},
	bottom: function(x, y, z, block, ret, blockLight = 0) { // Actually the top
		let blocks = this.blocks
		blocks[0] = (getBlock(x-1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x+1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x-1, y+1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x, y+1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x+1, y+1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x-1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x+1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 3, 6, 7)
		ret[1] = average(blocks, 4, 5, 7, 8)
		ret[2] = average(blocks, 4, 1, 2, 5)
		ret[3] = average(blocks, 4, 0, 1, 3)
		return ret
	},
	north: function(x, y, z, block, ret, blockLight = 0) {
		let blocks = this.blocks
		blocks[0] = (getBlock(x-1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x+1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x-1, y, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x, y, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x+1, y, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x-1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x+1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 5, 7, 8)
		ret[1] = average(blocks, 4, 3, 6, 7)
		ret[2] = average(blocks, 4, 0, 1, 3)
		ret[3] = average(blocks, 4, 1, 2, 5)
		return ret
	},
	south: function(x, y, z, block, ret, blockLight = 0) {
		let blocks = this.blocks
		blocks[0] = (getBlock(x-1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x-1, y, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x-1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x, y, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x+1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x+1, y, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x+1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 1, 2, 5)
		ret[1] = average(blocks, 4, 5, 7, 8)
		ret[2] = average(blocks, 4, 3, 6, 7)
		ret[3] = average(blocks, 4, 0, 1, 3)
		return ret
	},
	east: function(x, y, z, block, ret, blockLight = 0) {
		let blocks = this.blocks
		blocks[0] = (getBlock(x+1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x+1, y, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x+1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x+1, y-1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x+1, y, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x+1, y+1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x+1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x+1, y, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x+1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 1, 2, 5)
		ret[1] = average(blocks, 4, 5, 7, 8)
		ret[2] = average(blocks, 4, 3, 6, 7)
		ret[3] = average(blocks, 4, 0, 1, 3)
		return ret
	},
	west: function(x, y, z, block, ret, blockLight = 0) {
		let blocks = this.blocks
		blocks[0] = (getBlock(x-1, y-1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[1] = (getBlock(x-1, y, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[2] = (getBlock(x-1, y+1, z-1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[3] = (getBlock(x-1, y-1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[4] = (getBlock(x-1, y, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[5] = (getBlock(x-1, y+1, z, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[6] = (getBlock(x-1, y-1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[7] = (getBlock(x-1, y, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4
		blocks[8] = (getBlock(x-1, y+1, z+1, block) & 0xf << blockLight * 4) >> blockLight * 4

		ret[0] = average(blocks, 4, 5, 7, 8)
		ret[1] = average(blocks, 4, 1, 2, 5)
		ret[2] = average(blocks, 4, 0, 1, 3)
		ret[3] = average(blocks, 4, 3, 6, 7)
		return ret
	},
}

class Section {
	constructor(x, y, z, size, chunk, caves, world) {
		this.x = x
		this.y = y
		this.z = z
		this.size = size
		this.arraySize = size * size * size
		this.blocks = new Int32Array(this.arraySize)
		this.light = new Uint8Array(this.arraySize)
		this.renderData = []
		this.renderLength = 0
		this.faces = 0
		this.chunk = chunk
		this.edited = false
		this.caves = caves
		this.pallete = [0]
		this.palleteMap = { "0": 0 }
		this.palleteSize = 0
		this.world = world
	}

	deleteBlock(x, y, z) {
		let s = this.size
		this.blocks[x * s * s + y * s + z] = 0
	}

	genMesh(bigArray, index) {
		const { world } = this
		if (!this.renderLength) {
			return index
		}
		let length = this.renderLength
		let rData = this.renderData
		let x = 0, y = 0, z = 0, loc = 0, data = 0,
			sides = 0, tex = null, x2 = 0, y2 = 0, z2 = 0,
			verts = null, texVerts = null, texShapeVerts = null,
			tx = 0, ty = 0
		let wx = this.x, wy = this.y, wz = this.z
		let blocks = world.getAdjacentSubchunks(wx, wy, wz)
		let lightChunks = world.getAdjacentSubchunks(wx, wy, wz, true)
		let block = null

		let shadows = null, slights = [0, 0, 0, 0], blights = [0, 0, 0, 0]
		let blockSides = Object.keys(Block)
		let side = ""
		let shapeVerts = null
		let shapeTexVerts = null
		let pallete = this.pallete

		for (let i = 0; i < length; i++) {
			data = rData[i]
			block = blockData[pallete[data & 0x1fff]]
			tex = block.textures
			sides = data >> 13 & 0x3f
			loc = data >> 19 & 0xfff
			x = loc & 15
			y = loc >> 4 & 15
			z = loc >> 8 & 15

			x2 = x + this.x
			y2 = y + this.y
			z2 = z + this.z

			shapeVerts = block.shape.verts
			shapeTexVerts = block.shape.texVerts

			let texNum = 0
			for (let n = 0; n < 6; n++) {
				side = blockSides[n]
				if (sides & Block[side]) {
					shadows = getShadows[side](x, y, z, blocks)
					slights = getLight[side](x, y, z, lightChunks, slights, 0)
					blights = getLight[side](x, y, z, lightChunks, blights, 1)
					let directionalFaces = shapeVerts[n]
					for (let facei = 0; facei < directionalFaces.length; facei++) {
						verts = directionalFaces[facei]
						texVerts = textureCoords[textureMap[tex[texNum]]]
						tx = texVerts[0]
						ty = texVerts[1]
						texShapeVerts = shapeTexVerts[n][facei]

						bigArray[index] = verts[0] + x2
						bigArray[index+1] = verts[1] + y2
						bigArray[index+2] = verts[2] + z2
						bigArray[index+3] = tx + texShapeVerts[0]
						bigArray[index+4] = ty + texShapeVerts[1]
						bigArray[index+5] = shadows[0]
						bigArray[index+6] = slights[0]
						bigArray[index+7] = blights[0]

						bigArray[index+8] = verts[3] + x2
						bigArray[index+9] = verts[4] + y2
						bigArray[index+10] = verts[5] + z2
						bigArray[index+11] = tx + texShapeVerts[2]
						bigArray[index+12] = ty + texShapeVerts[3]
						bigArray[index+13] = shadows[1]
						bigArray[index+14] = slights[1]
						bigArray[index+15] = blights[1]

						bigArray[index+16] = verts[6] + x2
						bigArray[index+17] = verts[7] + y2
						bigArray[index+18] = verts[8] + z2
						bigArray[index+19] = tx + texShapeVerts[4]
						bigArray[index+20] = ty + texShapeVerts[5]
						bigArray[index+21] = shadows[2]
						bigArray[index+22] = slights[2]
						bigArray[index+23] = blights[2]

						bigArray[index+24] = verts[9] + x2
						bigArray[index+25] = verts[10] + y2
						bigArray[index+26] = verts[11] + z2
						bigArray[index+27] = tx + texShapeVerts[6]
						bigArray[index+28] = ty + texShapeVerts[7]
						bigArray[index+29] = shadows[3]
						bigArray[index+30] = slights[3]
						bigArray[index+31] = blights[3]
						index += 32
					}
				}
				texNum++
			}
		}
		return index
	}
	async carveCaves() {
		const { world } = this
		while (!window.workers.length) {
			await Promise.race(window.pendingWorkers)
		}
		const data = await window.doWork({
			caves: true,
			x: this.x,
			y: this.y,
			z: this.z
		})
		const caves = data.caves

		let sx = this.x, sy = this.y, sz = this.z
		let cy = 0
		for (let x = 0; x < 16; x++) {
			for (let z = 0; z < 16; z++) {
				cy = this.chunk.tops[z * 16 + x]
				cy = cy > sy + 15 ? 16 : cy & 15
				for (let y = 0; y < cy; y++) {
					if (caves[x * 256 + y * 16 + z]) {
						carveSphere(sx + x, sy + y, sz + z, world)
					}
				}
			}
		}
		this.caves = true
	}
	tick() {
		const { world } = this
		for (let i = 0; i < 3; i++) {
			let rnd = Math.random() * this.blocks.length | 0
			if (this.blocks[rnd] === blockIds.grass) {
				// Spread grass

				let x = (rnd >> 8) + this.x
				let y = (rnd >> 4 & 15) + this.y
				let z = (rnd & 15) + this.z
				if (!blockData[world.getBlock(x, y + 1, z)].transparent) {
					world.setBlock(x, y, z, blockIds.dirt, false)
					return
				}

				let rnd2 = Math.random() * 27 | 0
				let x2 = rnd2 % 3 - 1
				rnd2 = (rnd2 - x2 - 1) / 3
				let y2 = rnd2 % 3 - 1
				rnd2 = (rnd2 - y2 - 1) / 3
				z += rnd2 - 1
				x += x2
				y += y2

				if (world.getBlock(x, y, z) === blockIds.dirt && world.getBlock(x, y + 1, z) === blockIds.air) {
					world.setBlock(x, y, z, blockIds.grass, false)
				}
			}
		}
	}

	setWorld(world) {
		this.world = world
	}
	setCaves(caves) {
		this.caves = caves
	}
}

let emptySection = new Section(0, 0, 0, 16, null, null)
let fullSection = new Section(0, 0, 0, 16, null, null)

fullSection.blocks.fill(blockIds.bedrock)
emptySection.light.fill(15)

export { Section, noiseSettings, emptySection, fullSection }