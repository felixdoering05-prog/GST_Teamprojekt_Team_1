import * as THREE from 'three';

export function addSurroundings(scene, bounds, example = false) {
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 10);
  const group = new THREE.Group();
  group.position.y = bounds.min.y - .08;
  const box = (width, height, depth, x, y, z, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.position.set(x, y + height / 2, z); mesh.receiveShadow = true; mesh.castShadow = height > .5; group.add(mesh); return mesh;
  };
  box(span * 12, .12, span * 12, 0, -.2, 0, '#e5e9ee');
  box(size.x + 8, .08, size.z + 8, 0, -.04, 0, '#f5f4ef');
  if (example) {
    for (const x of [-29, 29]) {
      box(8, .06, 160, x, 0, 0, '#b1bfd4');
      for (let z = -76; z < 80; z += 7) box(.13, .08, 3, x, .01, z, '#edf2fa');
      for (const edge of [-4.6, 4.6]) box(.4, .1, 160, x + edge, 0, 0, '#f4f5f7');
    }
    for (const z of [-30, 30]) box(150, .06, 5, 0, 0, z, '#bcc7d8');
    const contextWindow = new THREE.MeshStandardMaterial({ color: '#99a6bd', roughness: 1 });
    for (const [x, z, floors] of [[-49,-18,3],[-49,13,2],[49,-17,4],[49,15,3],[-11,-52,2],[12,-52,3],[-13,53,3],[13,53,2]]) {
      box(16, floors * 3.2, 12, x, 0, z, '#f2f2f1');
      for (let f = 0; f < floors; f++) for (let wx = -6; wx <= 6; wx += 3) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, .03), contextWindow);
        window.position.set(x + wx, f * 3.2 + 1.8, z + 6.03); group.add(window);
      }
    }
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#a39177' });
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: '#8fbea0', roughness: 1 });
    for (const [x, z] of [[-18,-17],[-12,-17],[-6,-17],[17,-15],[17,-10],[17,15],[-17,15],[-12,15],[0,44],[8,44],[-45,38],[44,-38]]) {
      box(5, .05, 5, x, .01, z, '#c9dfca');
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,1.8,6),trunkMaterial); trunk.position.set(x,.9,z); group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.25,10,8),leavesMaterial); crown.scale.y=1.35; crown.position.set(x,2.6,z); crown.castShadow=true; group.add(crown);
    }
  }
  scene.add(group);
  return () => group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}
