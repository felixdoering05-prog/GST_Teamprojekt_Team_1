export const WORK_STATUS = { planned: 'Geplant', in_progress: 'In Bearbeitung', completed: 'Erledigt' };

export const assetURL = (building, id) => '/betrieb/technische-anlagen?building=' + building + (id ? '&asset=' + id : '');
export const workURL = (building, id, task) => '/betrieb/wartungen?building=' + building + (id ? '&asset=' + id : '') + (task ? '&task=' + task : '');

export function assetModelURL(buildingID, modelID, assetID, link = false) {
  return '/bim-viewer?' + new URLSearchParams({ building: buildingID, model: modelID, [link ? 'linkAsset' : 'asset']: assetID });
}
