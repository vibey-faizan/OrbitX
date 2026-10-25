/**
 * Module worker that paints planet textures off the main thread so the hero
 * animation and UI stay smooth while surfaces are generated.
 */
import { paintTexture } from './texture-painters.js';

self.onmessage = (event) => {
  const { jobs } = event.data;
  for (const job of jobs) {
    try {
      const { width, height, data } = paintTexture(job.id, job.width);
      self.postMessage({ type: 'texture', id: job.id, width, height, buffer: data.buffer }, [data.buffer]);
    } catch (error) {
      self.postMessage({ type: 'error', id: job.id, message: String(error) });
    }
  }
  self.postMessage({ type: 'done' });
};
