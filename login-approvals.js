function openLoginApprovals(){if(!requireAdmin())return;if(__bookingDirty && !confirm('Discard unsaved booking changes?'))return;__bookingDirty=false;currentEditingFileId=null;activeTab='approvals';setRoleTabs(true);}
function pendingLoginRequests(){return loadUsers().filter(u=>u.role!=='admin' && u.approvalStatus==='pending');}
function updateApprovalNotice(){const button=document.getElementById('login-approval-alert');if(!button)return;const count=isAdmin()?pendingLoginRequests().length:0;button.hidden=!count;button.textContent='Registrations ('+count+')';}
function renderLoginApprovals(container){
 if(!requireAdmin())return;
 const users=loadUsers().filter(u=>u.role!=='admin' && u.approvalStatus);
 container.innerHTML=`<div class="actionbar"><div class="actionbar-title">Employee Registration Approvals</div><button class="btn btn-outline" onclick="renderMain()">Refresh</button></div><p>Approve new staff once. Approved employees can log in freely afterward. Manage account access in Users &amp; Access Matrix.</p><div class="tbl-wrapper"><table><thead><tr><th>Full name</th><th>Username</th><th>Department</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map(u=>`<tr><td>${htmlEscape(u.name)}</td><td>${htmlEscape(u.username)}</td><td>${htmlEscape(ROLES[u.role].label)}</td><td>${htmlEscape(u.approvalStatus)}</td><td>${u.approvalStatus!=='approved'?'<button class="btn btn-success" data-status="approved">Approve</button> ':''}${u.approvalStatus==='pending'?'<button class="btn btn-outline" data-status="rejected">Reject</button>':''}</td></tr>`).join('')||'<tr><td colspan="5">No new registrations yet.</td></tr>'}</tbody></table></div>`;
 container.querySelectorAll('tbody tr').forEach((row,i)=>row.querySelectorAll('[data-status]').forEach(button=>button.onclick=()=>decideLoginRequest(users[i].username,button.dataset.status)));
 updateApprovalNotice();
}
async function decideLoginRequest(username,status){
 if(!requireAdmin() || !['approved','rejected'].includes(status))return;
 try{ await cloudPull(); }catch(_){}
 const users=loadUsers(),user=users.find(u=>u.username===username && u.role!=='admin');
 if(!user || !['pending','rejected'].includes(user.approvalStatus))return;
 user.approvalStatus=status;user.approvedBy=currentUsername;user.approvalDate=Date.now();user.authVersion=(user.authVersion||0)+1;
 if(!saveUsers(users))return;
 refreshFromStorage();addLog(currentUser,'Super Admin',username,'Registration '+status,user.name);saveData();renderMain();updateApprovalNotice();
}
function initializeOfficeAuth() {
  const user=authSessionUser();
  if(user) {const record=sessionStorage.getItem('romford_record_login')==='1';sessionStorage.removeItem('romford_record_login');enterOffice(user,record);}
  else if(location.protocol==='file:') initSignIn();
  else {location.replace('signin.html');return;}
  setInterval(()=>{
    if(currentUsername && !authSessionUser()) {__bookingDirty=false;handleLogout();return;}
    updateApprovalNotice();
  },1500);
}
window.addEventListener('storage',event=>{
  if(event.key!==LOGIN_REQUESTS_KEY && event.key!==USERS_KEY && event.key!==null) return;
  if(currentUsername && !authSessionUser()) {__bookingDirty=false;handleLogout();return;}
  updateApprovalNotice();
  if(isAdmin() && activeTab==='approvals') renderMain();
});
