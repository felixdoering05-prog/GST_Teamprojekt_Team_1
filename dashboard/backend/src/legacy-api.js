function retiredLegacyBuildings(_req,res){
 res.status(410).json({error:'Diese alte Schnittstelle wurde stillgelegt. Bitte anmelden und /api/v1 verwenden.'});
}
module.exports={retiredLegacyBuildings};
