export const START = Object.freeze({ x: 0, z: 13.3 });
export const SHRINE = Object.freeze({ x: 0, z: -6.2 });
const solid = [
  [-6.4, -5.25, -11.4, -2.7], [5.25, 6.4, -11.4, -2.7], [-6.4, 6.4, -11.6, -10.3],
  [-6.3, -2.35, -3.45, -2.65], [2.35, 6.3, -3.45, -2.65],
  [-1.6, 1.6, -10, -8.1], [-1.05, 1.05, -.7, 1.1],
  [-3.8, -2.85, 7.7, 9.1], [2.85, 3.8, 7.7, 9.1],
  [-10.8, -4.8, -1.6, 4.1], [6.1, 9.7, -.8, 3.1],
  [-9, -4.8, -10.9, -5], [6.8, 10, -10.9, -5],
];
export function canWalk(x, z) {
  return Number.isFinite(x) && Number.isFinite(z) && x > -11.4 && x < 11.4 && z > -10.1 && z < 15.1 && !solid.some(([l,r,t,b]) => x > l-.23 && x < r+.23 && z > t-.23 && z < b+.23);
}
export function moveStep(position, dx, dz) {
  const p = { ...position };
  if (canWalk(p.x + dx, p.z)) p.x += dx;
  if (canWalk(p.x, p.z + dz)) p.z += dz;
  return p;
}
export function floorHeight(x,z) {
  if (Math.abs(x) < 6.5 && z < -3) return .72;
  if (Math.abs(x) < 2.6 && z < -1.8) return Math.max(0, Math.min(.72, (-z-1.8)/1.2*.72));
  return 0;
}
export function zoneAt(x,z) { return z < -4 && Math.abs(x) < 5.2 ? 'hall' : z < 8 ? 'courtyard' : 'gate'; }
// Grid A* keeps click-to-walk and the guided journey outside water, walls and furniture.
export function findPath(start, destination) {
  if (!canWalk(destination.x,destination.z)) return [];
  const step=.5, key=(x,z)=>`${x},${z}`, sx=Math.round(start.x/step),sz=Math.round(start.z/step),tx=Math.round(destination.x/step),tz=Math.round(destination.z/step);
  const startNode={x:sx,z:sz,g:0,f:0,parent:null},open=[startNode],visited=new Set(),best=new Map([[key(sx,sz),0]]);
  for(let count=0;open.length && count<6500;count++) {
    open.sort((a,b)=>a.f-b.f); const node=open.shift(),k=key(node.x,node.z);
    if(visited.has(k))continue;visited.add(k);
    if(node.x===tx&&node.z===tz){const route=[];let n=node;while(n.parent){route.push({x:n.x*step,z:n.z*step});n=n.parent;}route.reverse();route.push({...destination});return route;}
    for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=node.x+dx,z=node.z+dz,kk=key(x,z),g=node.g+Math.hypot(dx,dz);
      if(visited.has(kk)||!canWalk(x*step,z*step)||dx&&dz&&(!canWalk(node.x*step+dx*step,node.z*step)||!canWalk(node.x*step,node.z*step+dz*step))||g>=(best.get(kk)??Infinity))continue;
      best.set(kk,g);open.push({x,z,g,f:g+Math.hypot(tx-x,tz-z),parent:node});
    }
  }
  return [];
}
