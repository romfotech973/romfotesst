// Shared browser-local accounts for sign-in and the office app.
const LOGIN_REQUESTS_KEY = 'romford_login_requests_v1';
const PENDING_LOGIN_KEY = 'romford_pending_login_v1';
const LOGIN_REQUEST_TTL = 30 * 60 * 1000;
const LOGIN_SESSION_TTL = 8 * 60 * 60 * 1000;

function readAuthJson(storage,key,fallback) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
}
function loadLoginRequests() {
  const records=readAuthJson(localStorage,LOGIN_REQUESTS_KEY,[]);
  return Array.isArray(records) ? records.filter(r=>r && typeof r.id==='string') : [];
}
function saveLoginRequests(records) {
  try { localStorage.setItem(LOGIN_REQUESTS_KEY,JSON.stringify(records)); if(typeof cloudPush==='function')cloudPush(['requests']); return true; }
  catch (_) { alert('Could not save the access request. Browser storage is unavailable.'); return false; }
}
function authSessionUser() {
  const session=readAuthJson(sessionStorage,SESSION_KEY,null);
  if (!session || !session.id || !(session.expiresAt>Date.now())) return null;
  const user=loadUsers().find(u=>u.username===session.username && u.role===session.role && u.active!==false && (u.authVersion||0)===session.authVersion);
  if (!user) return null;
  if(user.role==='admin') return user;
  return user.approvalStatus==='approved' || user.approvalStatus==null ? user : null;
}
function createAuthSession(user,request) {
  const session={id:crypto.randomUUID(),username:user.username,role:user.role,authVersion:user.authVersion||0,
    requestId:request?.id || null,expiresAt:request?.expiresAt || Date.now()+LOGIN_SESSION_TTL};
  try { sessionStorage.setItem(SESSION_KEY,JSON.stringify(session)); sessionStorage.removeItem(PENDING_LOGIN_KEY); return true; }
  catch (_) { alert('Sign-in requires browser session storage. Please enable it and retry.'); return false; }
}
function endAuthSession() {
  const session=readAuthJson(sessionStorage,SESSION_KEY,null);
  if(session?.requestId) {
    const requests=loadLoginRequests(), request=requests.find(r=>r.id===session.requestId);
    if(request) {request.status='ended';request.endedAt=Date.now();saveLoginRequests(requests);}
  }
  sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(PENDING_LOGIN_KEY);
  localStorage.removeItem(SESSION_KEY);
  if(typeof setCloudToken==='function')setCloudToken('');
}
    const ROLES = {
      sales: { label: "Sales Department", defaultUser: "Arjun", badge: "badge-brand" },
      ops: { label: "Operations & Costing", defaultUser: "Salahu", badge: "badge-warning" },
      accounts: { label: "Accounts & Management", defaultUser: "Accountant", badge: "badge-purple" },
      admin: { label: "Super Admin", defaultUser: "Shahinsha", badge: "badge-danger" }
    };
    const USERS_KEY = "romford_users_v1";
    const SESSION_KEY = "romford_session_v1";
    // Seed accounts: at least 2 users in Sales, plus Ops, Accounts and Admin.
    // Edit this list (or add via the login screen) to add more staff.
    const DEFAULT_USERS = [
      { username: "shahinsha",  password: "shahinsha@123",  name: "Shahinsha",  role: "admin" },
      { username: "arjun",      password: "arjun123",  name: "Arjun",      role: "sales" },
      { username: "neha",       password: "neha123",   name: "Neha",       role: "sales" },
      { username: "salahu",     password: "salahu123", name: "Salahu",     role: "ops" },
      { username: "accountant", password: "acc123",    name: "Accountant", role: "accounts" }
    ];

    function loadUsers() {
      try {
        const s = localStorage.getItem(USERS_KEY);
        if (s) {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) return migrateAdminAccount(arr).filter(u => u && typeof u.username === 'string' && ROLES[u.role]);
          return [];
        }
      } catch (e) { return []; }
      try { localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS)); } catch (e) {}
      return JSON.parse(JSON.stringify(DEFAULT_USERS));
    }

    function saveUsers(users) {
      try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); if(typeof cloudPush==='function')cloudPush(['users']); return true; }
      catch(e) { alert('Could not save staff accounts. Browser storage is unavailable.'); return false; }
    }


function migrateAdminAccount(users) {
  if(localStorage.getItem('romford_admin_identity_v2')) return users;
  const old=users.find(u=>u.role==='admin' && u.username==='admin');
  const named=users.find(u=>u.username==='shahinsha');
  if(old && !named) {old.username='shahinsha';old.password='shahinsha@123';old.authVersion=(old.authVersion||0)+1;}
  if(!old && !named) users.push({username:'shahinsha',password:'shahinsha@123',name:'Shahinsha',role:'admin',active:true});
  if(saveUsers(users)) localStorage.setItem('romford_admin_identity_v2','1');
  return users;
}

// Explicit owner-requested cleanup. Runs once per browser/site when this update loads.
// Keep this marker stable so later reloads never erase newly entered records.
function applyRequestedDataReset() {
  const marker='romford_owner_reset_20261123_01';
  if(localStorage.getItem(marker)==='complete') return;
  const admin=loadUsers().find(user=>user.username.toLowerCase()==='shahinsha' && user.role==='admin');
  if(!admin) throw new Error('Reset cancelled: Shahinsha administrator account was not found.');
  const keys=['romford_office_db_v4',USERS_KEY,LOGIN_REQUESTS_KEY,SESSION_KEY];
  const previous=keys.map(key=>localStorage.getItem(key));
  try {
    localStorage.setItem(USERS_KEY,JSON.stringify([{...admin,active:true,permissions:{},authVersion:(admin.authVersion||0)+1}]));
    localStorage.removeItem('romford_office_db_v4');
    localStorage.removeItem(LOGIN_REQUESTS_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(PENDING_LOGIN_KEY);
    sessionStorage.removeItem('romford_record_login');
    localStorage.setItem(marker,'complete');
  } catch(error) {
    keys.forEach((key,index)=>{
      if(previous[index]===null) localStorage.removeItem(key);
      else localStorage.setItem(key,previous[index]);
    });
    throw error;
  }
}
applyRequestedDataReset();
