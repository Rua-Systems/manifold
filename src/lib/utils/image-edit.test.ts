import { describe, expect, it } from 'vitest';
import {
	adjustPixels,
	cropBetween,
	cropPixels,
	editedName,
	exportType,
	hasAdjustments,
	NO_ADJUSTMENTS,
	orientedSize,
	turn
} from './image-edit';

function pixel(red: number, green: number, blue: number, alpha = 255): Uint8ClampedArray {
	return new Uint8ClampedArray([red, green, blue, alpha]);
}

describe('adjustPixels', () => {
	it('leaves pixels alone without adjustments', () => {
		const data = pixel(10, 120, 240, 200);
		adjustPixels(data, NO_ADJUSTMENTS);
		expect([...data]).toEqual([10, 120, 240, 200]);
		expect(hasAdjustments(NO_ADJUSTMENTS)).toBe(false);
	});

	it('brightens and darkens, clamped to the range', () => {
		const brighter = pixel(100, 100, 100);
		adjustPixels(brighter, { ...NO_ADJUSTMENTS, brightness: 20 });
		expect([...brighter]).toEqual([151, 151, 151, 255]);

		const black = pixel(10, 10, 10);
		adjustPixels(black, { ...NO_ADJUSTMENTS, brightness: -100 });
		expect([...black]).toEqual([0, 0, 0, 255]);
	});

	it('spreads values away from the middle with more contrast', () => {
		const data = new Uint8ClampedArray([64, 64, 64, 255, 192, 192, 192, 255]);
		adjustPixels(data, { ...NO_ADJUSTMENTS, contrast: 50 });
		expect(data[0]).toBeLessThan(64);
		expect(data[4]).toBeGreaterThan(192);
	});

	it('removes colour without saturation and with the grey filter', () => {
		const flat = pixel(200, 100, 50);
		adjustPixels(flat, { ...NO_ADJUSTMENTS, saturation: -100 });
		expect(flat[0]).toBe(flat[1]);
		expect(flat[1]).toBe(flat[2]);

		const grey = pixel(200, 100, 50);
		adjustPixels(grey, { ...NO_ADJUSTMENTS, filter: 'grayscale' });
		expect([grey[0], grey[1], grey[2]]).toEqual([124, 124, 124]);
	});

	it('tints warm with sepia and keeps alpha', () => {
		const data = pixel(100, 100, 100, 80);
		adjustPixels(data, { ...NO_ADJUSTMENTS, filter: 'sepia' });
		expect(data[0]).toBeGreaterThan(data[1]);
		expect(data[1]).toBeGreaterThan(data[2]);
		expect(data[3]).toBe(80);
	});
});

describe('geometry', () => {
	it('turns in quarter steps either way', () => {
		expect(turn(0, 1)).toBe(90);
		expect(turn(0, -1)).toBe(270);
		expect(turn(270, 1)).toBe(0);
		expect(orientedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
		expect(orientedSize(400, 300, 180)).toEqual({ width: 400, height: 300 });
	});

	it('crops in whole pixels within the image', () => {
		expect(cropPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 }, 400, 200)).toEqual({
			x: 100,
			y: 100,
			width: 200,
			height: 100
		});
		expect(cropPixels({ x: 0.999, y: 0, width: 0.0001, height: 1 }, 10, 10)).toEqual({
			x: 9,
			y: 0,
			width: 1,
			height: 10
		});
	});

	it('takes a crop between two points in any order, but not a speck', () => {
		expect(cropBetween({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual({
			x: 0.2,
			y: 0.1,
			width: 0.6000000000000001,
			height: 0.8
		});
		expect(cropBetween({ x: -1, y: 0 }, { x: 0.5, y: 2 })).toMatchObject({ x: 0, width: 0.5 });
		expect(cropBetween({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.6 })).toBeNull();
	});
});

describe('the copy', () => {
	it('keeps the type, but saves a GIF as PNG', () => {
		expect(exportType('image/jpeg')).toBe('image/jpeg');
		expect(exportType('image/webp')).toBe('image/webp');
		expect(exportType('image/gif')).toBe('image/png');
	});

	it('names the copy after the original', () => {
		expect(editedName('photo.JPG', 'edited', 'image/jpeg')).toBe('photo (edited).jpg');
		expect(editedName('anim.gif', 'düzenlendi', 'image/png')).toBe('anim (düzenlendi).png');
		expect(editedName('.hidden', 'edited', 'image/png')).toBe('.hidden (edited).png');
	});
});
