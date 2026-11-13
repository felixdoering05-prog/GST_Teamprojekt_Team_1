// Provider output contract, independent of the modelling commands. Geometry is still validated locally.
const number={type:'number'},text={type:'string'},boolean={type:'boolean'};
const list=(items)=>({type:'array',items});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const point={type:'array',items:number,minItems:2,maxItems:2};
const geometrySchema=object({status:{type:'string',enum:['ok','needs_input']},reason:text,warnings:list(text),levels:list(object({
 name:text,elevation:number,height:number,height_assumed:boolean,width:number,depth:number,
 dimension_evidence:list(object({axis:{type:'string',enum:['x','y']},mm:number,label:text})),
 boundary:list(point),walls:list(object({a:point,b:point,thickness:number})),
 openings:list(object({kind:{type:'string',enum:['window','door']},at:point,width:number,height:number,sill:number})),
 rooms:list(object({name:text,point}))
}))});
module.exports={geometrySchema};
