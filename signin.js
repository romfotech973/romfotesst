let signInPoll;
function initSignIn(mode='login') {
  const root=document.getElementById('signin-root');if(!root)return;
  const register=mode==='register';
  root.innerHTML=`<img class="signin-logo" id="login-logo-img" alt="Romford Holidays" width="180">
    <div class="login-title"><h1>${register?'Create your staff account':'Welcome back'}</h1><p>${register?'Register once. Start after admin approval.':'Log in to your Romford workspace.'}</p></div>
    <div class="auth-tabs"><button type="button" class="btn ${register?'btn-outline':'btn-primary'}" onclick="initSignIn('login')">Login</button><button type="button" class="btn ${register?'btn-primary':'btn-outline'}" onclick="initSignIn('register')">Sign in / New user</button></div>
    <form id="signin-form" onsubmit="${register?'submitRegistration':'submitSignIn'}(event)">
    ${register?`<div class="form-group"><label for="register-name">Full name *</label><input id="register-name" class="form-control" autocomplete="name" required maxlength="100"></div>
    <div class="form-group"><label for="login-role">Department *</label><select id="login-role" class="form-control" required><option value="" disabled selected>Select your department</option><option value="sales">Sales Department</option><option value="ops">Operations &amp; Costing</option><option value="accounts">Accounts &amp; Management</option></select></div>`:''}
    <div class="form-group"><label for="login-username">Username *</label><input id="login-username" class="form-control" autocomplete="username" required pattern="[A-Za-z0-9_.-]{2,50}"></div>
    <div class="form-group"><label for="login-password">${register?'Set password':'Password'} *</label><input id="login-password" type="password" class="form-control" autocomplete="${register?'new-password':'current-password'}" ${register?'minlength="8"':''} required></div>
    ${register?'<div class="form-group"><label for="register-confirm">Re-enter password *</label><input id="register-confirm" type="password" class="form-control" autocomplete="new-password" required></div>':''}
    <button type="submit" class="btn btn-primary signin-submit">${register?'Save & request approval':'Login'}</button></form>
    <div id="signin-message" role="status" aria-live="polite"></div>
    <p class="signin-help">${register?'Choose a unique username for future logins. Your account needs approval only once.':'Already approved? Log in anytime. No further admin approval is needed.'}</p>`;
  if(typeof LOGO_BASE64!=='undefined')document.getElementById('login-logo-img').src=LOGO_BASE64;
}
function signInMessage(text){document.getElementById('signin-message').textContent=text;}
async function submitRegistration(event){
  event.preventDefault();
  try{ await cloudPull(); }catch(_){}
  const name=document.getElementById('register-name').value.trim(),username=document.getElementById('login-username').value.trim().toLowerCase(),role=document.getElementById('login-role').value,password=document.getElementById('login-password').value;
  if(!name || !['sales','ops','accounts'].includes(role) || !/^[a-z0-9_.-]{2,50}$/.test(username)){signInMessage('Enter your full name, a valid username and department.');return;}
  if(password.length<8){signInMessage('Use at least 8 characters for your password.');return;}
  if(password!==document.getElementById('register-confirm').value){signInMessage('Passwords do not match. Please re-enter them.');return;}
  const users=loadUsers();if(users.some(u=>u.username.toLowerCase()===username)){signInMessage('That username already exists. Choose another username or log in.');return;}
  users.push({username,name,role,password,active:true,approvalStatus:'pending',registeredAt:Date.now(),authVersion:0,permissions:{}});
  if(!saveUsers(users))return;
  initSignIn('login');document.getElementById('login-username').value=username;
  signInMessage('Registration saved. Your account is awaiting admin approval. Once approved, log in with your username and password.');
}
async function submitSignIn(event){
  event.preventDefault();
  try{ await cloudPull(); }catch(_){}
  const username=document.getElementById('login-username').value.trim().toLowerCase(),password=document.getElementById('login-password').value;
  const user=loadUsers().find(u=>u.username.toLowerCase()===username);
  if(!user || user.password!==password){signInMessage('Incorrect username or password.');return;}
  if(user.active===false){signInMessage('Your account is disabled. Contact your administrator.');return;}
  if(user.role!=='admin' && user.approvalStatus && user.approvalStatus!=='approved'){
    signInMessage(user.approvalStatus==='pending'?'Your registration is awaiting admin approval. Please try again after approval.':'Your registration was rejected. Contact your administrator.');return;
  }
  endAuthSession();if(createAuthSession(user))completeSignIn(user);
}
function completeSignIn(user){
  if(typeof enterOffice==='function')enterOffice(user,true);
  else {sessionStorage.setItem('romford_record_login','1');location.replace('index.html');}
}
