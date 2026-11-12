import { describe, expect, it } from 'vitest';
import { boundsAround, boundsContain, boundsOfPoints } from './geo';

describe('boundsOfPoints', () => {
  it('wraps every point, whatever order they come in', () => {
    const bounds = boundsOfPoints([
      { lat: 42.4, lng: -71.1 },
      { lat: 42.3, lng: -71.2 },
      { lat: 42.5, lng: -71.0 },
      { lat: 42.35, lng: -71.15 },
    ]);
    expect(bounds).toEqual({ south: 42.3, west: -71.2, north: 42.5, east: -71.0 });
  });

  it('turns the corners of a rotated view into a rectangle that still contains the view', () => {
    // A diamond: its corners sit on the middle of each side of the box.
    const corners = [
      { lat: 42.4, lng: -71.1 },
      { lat: 42.5, lng: -71.0 },
      { lat: 42.4, lng: -70.9 },
      { lat: 42.3, lng: -71.0 },
    ];
    const bounds = boundsOfPoints(corners);
    for (const corner of corners) expect(boundsContain(bounds, corner)).toBe(true);
  });

  it('describes one point as a zero-size box that contains it', () => {
    const point = { lat: 42.37, lng: -71.1 };
    expect(boundsContain(boundsOfPoints([point]), point)).toBe(true);
  });

  it('agrees with boundsAround for the corners of a square', () => {
    const square = boundsAround({ lat: 42.37, lng: -71.1 }, 1000);
    const corners = [
      { lat: square.south, lng: square.west },
      { lat: square.north, lng: square.east },
    ];
    expect(boundsOfPoints(corners)).toEqual(square);
  });
});
