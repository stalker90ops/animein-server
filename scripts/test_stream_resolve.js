import { resolveLk21Stream } from '../services/lk21Api.js';

async function test() {
  const embedUrl = 'https://videonode.de/iframe3/p2p/D81pWhFq6i7QyjMVaVQdqw';
  console.log('Resolving P2P embed:', embedUrl);
  const stream = await resolveLk21Stream(embedUrl);
  console.log('Resolved direct m3u8 stream:', stream);
}
test();
