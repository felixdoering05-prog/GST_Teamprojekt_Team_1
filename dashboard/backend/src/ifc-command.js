const actions=['hide','color','reset','unsupported'];
const targets=['selected','walls','doors','windows','roofs','slabs','all','none'];
const commandContext={mode:'ifc-command',actions,targets,limitations:['Nur Ansichtsänderungen, keine Dateibearbeitung.','Keine Raum-/Geschoss- oder Lichtbefehle.','Keine IFC-Inhalte oder Gebäudemetadaten an den KI-Dienst.']};
const commandSchema={type:'object',properties:{action:{type:'string',enum:actions},target:{type:'string',enum:targets},color:{type:['string','null']},summary:{type:'string'}},required:['action','target','color','summary'],additionalProperties:false};
const commandInstruction='Übersetze genau EINEN deutschen IFC-Ansichtsbefehl in das verlangte JSON. Erlaubt: hide (ausblenden), color (einfärben), reset (alles anzeigen und Originalfarben wiederherstellen). Ziel selected (angetipptes Bauteil), walls, doors, windows, roofs, slabs, all. reset nur mit all. Farbe als #RRGGBB, sonst null. summary kurz und deutsch als Vorschlag, niemals als bereits ausgeführt. Bei Fragen, Mehrfachbefehlen, Negationen, unklarer Absicht, Löschen/Ändern der IFC-Datei, Räumen, Geschossen, Licht, Codes oder sonstigen Aktionen: action unsupported, target none, color null und Grund in summary. Kein Code, keine Werkzeuge. Du kennst keine echten Bauteile, IDs oder Trefferzahlen.';
function validateCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='action,color,summary,target')throw Error('Invalid command');
 const {action,target,color,summary}=value;
 if(!actions.includes(action)||!targets.includes(target)||typeof summary!=='string'||!summary.trim()||summary.length>300)throw Error('Invalid command');
 if(action==='unsupported'){if(target!=='none'||color!==null)throw Error('Invalid unsupported command');}
 else if(target==='none'||(action==='reset'&&target!=='all')||(action==='color'?typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color):color!==null))throw Error('Invalid command fields');
 return {action,target,color:color?.toLowerCase()??null,summary:summary.trim()};
}
module.exports={commandContext,commandSchema,commandInstruction,validateCommand};
