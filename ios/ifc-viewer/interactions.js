export class ElementAppearance {
  constructor() { this.elements = new Map(); this.selectedID = undefined; }
  add(id, mesh) {
    if (!this.elements.has(id)) this.elements.set(id, []);
    mesh.userData.originalColor = mesh.material.color.clone();
    this.elements.get(id).push(mesh);
  }
  select(id) {
    for (const mesh of this.elements.get(this.selectedID) ?? []) mesh.material.emissive.set(0);
    this.selectedID = this.elements.has(id) ? id : undefined;
    for (const mesh of this.elements.get(this.selectedID) ?? []) mesh.material.emissive.set(0x136c76);
  }
  color(value) { for (const mesh of this.elements.get(this.selectedID) ?? []) mesh.material.color.set(value); }
  hide() {
    for (const mesh of this.elements.get(this.selectedID) ?? []) mesh.visible = false;
    this.select(undefined);
  }
  showAll() { for (const meshes of this.elements.values()) for (const mesh of meshes) mesh.visible = true; }
  resetColors() { for (const meshes of this.elements.values()) for (const mesh of meshes) mesh.material.color.copy(mesh.userData.originalColor); }
  get hiddenCount() { return [...this.elements.values()].filter(meshes => meshes.every(mesh => !mesh.visible)).length; }
  get visibleMeshes() { return [...this.elements.values()].flat().filter(mesh => mesh.visible); }
}
