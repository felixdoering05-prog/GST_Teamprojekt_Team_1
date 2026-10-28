import {createContext,useContext,useEffect,useState} from 'react';
import {base44,hasSession} from '@/api/base44Client';
const AuthContext=createContext(null);
export function AuthProvider({children}) {
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null);
 async function checkUserAuth(){
  setLoading(true);setError(null);
  try{setUser(hasSession()?await base44.auth.me():null)}catch(e){setUser(null);if(e.status!==401)setError(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{checkUserAuth()},[]);
 return <AuthContext.Provider value={{user,isAuthenticated:!!user,isLoadingAuth:loading,isLoadingPublicSettings:false,authChecked:!loading,authError:null,connectionError:error,checkUserAuth,checkAppState:checkUserAuth,logout:base44.auth.logout,navigateToLogin:base44.auth.redirectToLogin}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
