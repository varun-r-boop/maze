// Makes the objects on a top-down map stand out: whatever `draw` paints is given a crisp dark outline, a thin
// light rim along its top-left edges (as if lit from there) and a soft shadow on the floor below it.
// Used once when a map is rendered, so the cost doesn't matter.
function layerLike(m) {
  const c = document.createElement('canvas');
  c.width = m.canvas.width; c.height = m.canvas.height;
  return c;
}

export function drawDefined(m, draw, {
  line = 'rgba(8,8,12,.9)', width = 1.5, // outline
  rim = 'rgba(255,255,255,.22)', // light edge on the top-left; null for none
  shadow = 'rgba(0,0,0,.45)', drop = 4, blur = 4, // shadow on the floor
} = {}) {
  const layer = layerLike(m), l = layer.getContext('2d');
  draw(l);
  // the objects' silhouette in a flat color
  const tint = color => {
    const c = layerLike(m), s = c.getContext('2d');
    s.drawImage(layer, 0, 0);
    s.globalCompositeOperation = 'source-in'; s.fillStyle = color; s.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const sil = tint(line);
  m.save();
  m.setTransform(1, 0, 0, 1, 0, 0);
  if (shadow) {
    m.save();
    m.shadowColor = shadow; m.shadowBlur = blur; m.shadowOffsetX = drop * 0.6; m.shadowOffsetY = drop;
    m.drawImage(sil, 0, 0);
    m.restore();
  }
  for (let i = 0; i < 8; i++) { // the outline: the silhouette nudged out in every direction
    const a = i * Math.PI / 4;
    m.drawImage(sil, Math.round(Math.cos(a) * width * 10) / 10, Math.round(Math.sin(a) * width * 10) / 10);
  }
  m.drawImage(layer, 0, 0);
  if (rim) { // a light edge where the top-left of each object meets its outline
    const r = tint(rim), rc = r.getContext('2d');
    rc.globalCompositeOperation = 'destination-out'; rc.drawImage(layer, 1, 1);
    m.drawImage(r, 0, 0);
  }
  m.restore();
}
