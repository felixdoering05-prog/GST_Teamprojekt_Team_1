// Server-managed exceptions only; clients cannot request an exemption.
function unlimitedConversations(userID){
 return (process.env.AI_CONVERSATION_UNLIMITED_USER_IDS||'').split(',').some(value=>/^[1-9]\d{0,9}$/.test(value.trim())&&Number(value.trim())<=2147483647&&Number(value.trim())===Number(userID));
}
module.exports={unlimitedConversations};
