/* Local office access policy. A hosted deployment must enforce this on a server too. */
const PERMISSIONS = {
  bookings: 'View bookings', create: 'Create bookings', edit: 'Edit client and trip details',
  editAfter: 'Edit submitted bookings', editPrice: 'Edit selling price', editPriceAfter: 'Edit submitted prices',
  allBookings: 'Access other users’ bookings', drafts: 'Access other users’ drafts',
  costing: 'Edit supplier and net cost', ticketing: 'Update flight ticketing', visa: 'Update visa tracking',
  seeSupplier: 'View supplier names', seeCost: 'View net costs', seeMarkup: 'View profit and markup',
  receipts: 'Record client payments', verify: 'Verify client payments', approve: 'Approve supplier payments',
  payout: 'Record supplier payouts', invoice: 'Manage invoices', today: 'View task dashboard',
  supplierPayments: 'View supplier payment pipeline', cash: 'View cash book', suppliers: 'View supplier directory',
  manageSuppliers: 'Add suppliers', history: 'View audit history', export: 'Export and print reports'
};
const ROLE_DEFAULTS = {
  sales: ['bookings','create','edit','editAfter','editPrice','costing','ticketing','receipts','export'],
  ops: ['bookings','edit','editAfter','allBookings','costing','ticketing','visa','seeSupplier','seeCost','approve','supplierPayments','suppliers','manageSuppliers','export'],
  accounts: ['bookings','allBookings','editPrice','editPriceAfter','seeSupplier','seeCost','seeMarkup','receipts','verify','payout','invoice','today','supplierPayments','cash','suppliers','history','export']
};
let currentUsername = null;
let bookingSnapshot = null;

function htmlEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function normalizeDatabase(raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = { ...JSON.parse(JSON.stringify(INITIAL_DATA)), ...data };
  result.rules = { ...INITIAL_DATA.rules, ...data.rules };
  for (const key of ['bookings','suppliers','changeLog','loginLog']) {
    result[key] = Array.isArray(data[key]) ? data[key].filter(x => x && typeof x === 'object') : [];
  }
  result.bookings.forEach(b => { b.receipts = Array.isArray(b.receipts) ? b.receipts : []; b.schedule = Array.isArray(b.schedule) ? b.schedule : []; });
  result.permissions = {};
  for (const role of Object.keys(ROLE_DEFAULTS)) {
    result.permissions[role] = Object.fromEntries(Object.keys(PERMISSIONS).map(k => [k, ROLE_DEFAULTS[role].includes(k)]));
    if (!data.permissions && role === 'sales') {
      const r = result.rules;
      Object.assign(result.permissions.sales, {allBookings: !r.ownOnly, costing: r.enterDmc, ticketing: r.flightNet,
        seeSupplier:r.seeSupplier, seeCost:r.seeCost, seeMarkup:r.seeMarkup, editAfter:r.editAfter,
        editPriceAfter:r.editPriceAfter, export:r.canExport, history:r.seeHistory});
    }
    for (const key of Object.keys(PERMISSIONS)) {
      const value = data.permissions?.[role]?.[key];
      if (typeof value === 'boolean') result.permissions[role][key] = value;
    }
  }
  return result;
}
function signedInUser() {
  const user=authSessionUser();
  return currentUsername && user?.username===currentUsername ? user : null;
}
function isAdmin() { return signedInUser()?.role === 'admin'; }
function can(key) {
  const user = signedInUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Read the current policy even while a booking form is open in another tab.
  const policy = loadData().permissions;
  const assigned = k => typeof user.permissions?.[k] === 'boolean' ? user.permissions[k] : policy[user.role]?.[k] === true;
  // Financial reports expose supplier costs and must respect both switches.
  const dependencies = {cash:['seeCost','seeSupplier'], supplierPayments:['seeCost','seeSupplier'], suppliers:['seeSupplier'], seeMarkup:['seeCost']};
  return assigned(key) && (dependencies[key] || []).every(assigned);
}
function requirePermission(key) {
  if (can(key)) return true;
  alert('Your account does not have access to this action. Contact the administrator.');
  return false;
}
function requireAdmin() {
  if (isAdmin()) return true;
  alert('Only an administrator can manage users, permissions or system data.');
  return false;
}
function ownsBooking(b) {
  const user = signedInUser();
  return !!user && (b.ownerUsername ? b.ownerUsername.toLowerCase() === user.username.toLowerCase() : b.owner === user.name);
}
function canViewBooking(b) {
  return !!b && can('bookings') && (isAdmin() || (ownsBooking(b) || (can('allBookings') && (b.submitted || can('drafts')))));
}
function visibleBookings() { return DB.bookings.filter(canViewBooking); }
function requireBooking(id, permission) {
  const b = DB.bookings.find(x => x.id === id);
  if (!canViewBooking(b) || (permission && !can(permission))) {
    alert('This booking or action is not available to your account.'); return false;
  }
  return true;
}
function canEditDetails(f) { return can('edit') && (!f.submitted || can('editAfter')); }
function canEditPrice(f) { return can('editPrice') && (!f.submitted || can('editPriceAfter')); }
function canSaveBooking(f) {
  return canViewBooking(f) && (canEditDetails(f) || canEditPrice(f) || ['costing','ticketing','visa','invoice','receipts'].some(can));
}
function allowedTabs() {
  const items = [['bookings','Bookings','bookings'],['new_file','+ New Booking','create'],['today',"Today’s Tasks",'today'],
    ['supplier_pays','Supplier Payments','supplierPayments'],['cash','Cash Book','cash'],['profit','Profit & Markup','seeMarkup'],
    ['suppliers','Supplier Directory','suppliers'],['changelog','Audit History','history']];
  const tabs = items.filter(([, , p]) => can(p)).map(([id,label]) => ({id,label}));
  if (isAdmin()) tabs.push({id:'approvals',label:'Employee Approvals'}, {id:'rules',label:'Users & Access Matrix'}, {id:'security',label:'Login History'});
  return tabs;
}
function applyBookingPermissions(f, container) {
  bookingSnapshot = JSON.stringify(f);
  const special = {
    'bf-sell': canEditPrice(f), 'bf-ourprice': can('costing'), 'bf-salesknows':can('costing'),
    'bf-dmcname':can('costing'), 'bf-dmcnet':can('costing'), 'bf-flightcost':can('costing'), 'bf-supplier':can('costing'),
    'bf-pnr':can('ticketing'), 'bf-ticketno':can('ticketing'), 'bf-faretype':can('ticketing'), 'bf-ticketstatus':can('ticketing'),
    'bf-inv':can('invoice'), 'bf-vyapar':can('invoice'), 'bf-visastatus':can('visa'), 'bf-vfsdate':can('visa'), 'bf-docs':can('visa')
  };
  container.querySelectorAll('input,select,textarea').forEach(el => {
    const permitted = el.id.startsWith('new-pay-') ? can('receipts') : (special[el.id] ?? canEditDetails(f));
    if (!permitted) el.disabled = true;
  });
  const conceal = (ids, permitted) => {
    if (permitted) return;
    ids.forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.closest('.form-group')?.setAttribute('hidden',''); } });
  };
  conceal(['bf-dmcname','bf-supplier'], can('seeSupplier') || can('costing'));
  conceal(['bf-dmcnet','bf-ourprice','bf-flightcost'], can('seeCost') || can('costing'));
  container.querySelectorAll('button[onclick]').forEach(b => {
    const action = b.getAttribute('onclick');
    const checks = [['saveBookingChanges',canSaveBooking(f)],['saveFlightTicketing',can('ticketing')],['saveVisaDeskUpdates',can('visa')],
      ['saveBookingInvoice',can('invoice')],['addPassengerRow',canEditDetails(f)],['removePassengerRow',canEditDetails(f)],
      ['triggerCustomerDocImport',canEditDetails(f)],['printBooking',can('export')]];
    if (checks.some(([name,allowed]) => action.includes(name) && !allowed)) b.hidden = true;
  });
}
function saveBookingInvoice(id) {
  if (!requireBooking(id,'invoice')) return;
  saveBookingChanges(id);
}
function printBooking() { if (requirePermission('export')) window.print(); }
function localDate() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function applyPagePermissions(container) {
  const actions={startNewBookingFlow:'create',exportBookingsExcel:'export',exportBookingsPDF:'export',exportCashBookExcel:'export',
    exportSupplierPaymentsExcel:'export',openAddSupplierPrompt:'manageSuppliers',recordSupplierPayout:'payout',
    opsApprovePayment:'approve',verifyReceipt:'verify',saveTodayInvoice:'invoice'};
  container.querySelectorAll('button[onclick]').forEach(button=>{
    const action=button.getAttribute('onclick');
    if(Object.entries(actions).some(([name,permission])=>action.includes(name) && !can(permission))) button.hidden=true;
  });
}

function renderAccessRulesPage(container) {
  if (!requireAdmin()) return;
  const roles = Object.keys(ROLE_DEFAULTS);
  const users = loadUsers();
  container.innerHTML = `<div class="actionbar"><div class="actionbar-title">Users & Access Matrix</div>
    <button class="btn btn-primary" onclick="saveAccessRules()">Save Department Permissions</button></div>
    <p style="margin-bottom:16px">Admin has full access across every department. Staff inherit their department permissions unless an individual override is selected. Cash book and supplier payments also require supplier and cost visibility; profit requires cost visibility; the supplier directory requires supplier visibility. Editing costs allows reading the cost fields.</p>
    <div class="tbl-wrapper"><table><thead><tr><th>Permission</th>${roles.map(r=>`<th>${htmlEscape(ROLES[r].label)}</th>`).join('')}<th>Admin</th></tr></thead><tbody>
    ${Object.entries(PERMISSIONS).map(([key,label])=>`<tr><td>${label}</td>${roles.map(r=>`<td><input type="checkbox" aria-label="${htmlEscape(ROLES[r].label+' '+label)}" id="perm-${r}-${key}" ${DB.permissions[r][key]?'checked':''}></td>`).join('')}<td>Full access</td></tr>`).join('')}</tbody></table></div>
    <div class="actionbar" style="margin-top:24px"><div class="actionbar-title">Staff Accounts</div><button class="btn btn-primary" onclick="editStaffUser(-1)">Add User</button></div>
    <div class="tbl-wrapper"><table><thead><tr><th>Username</th><th>Name</th><th>Department</th><th>Status</th><th>Access</th><th></th></tr></thead><tbody>
    ${users.map((u,i)=>`<tr><td>${htmlEscape(u.username)}</td><td>${htmlEscape(u.name)}</td><td>${htmlEscape(ROLES[u.role]?.label || u.role)}</td><td>${u.active===false?'Disabled':'Active'}</td><td>${u.role==='admin'?'Full access':Object.keys(u.permissions||{}).length+' overrides'}</td><td><button class="btn btn-outline" onclick="editStaffUser(${i})">Edit</button></td></tr>`).join('')}</tbody></table></div>
    <div id="staff-editor" style="margin-top:20px"></div>
    <div style="margin-top:30px"><button class="btn btn-outline" onclick="resetAllData()">Reset All Data (Keep Shahinsha)</button></div>`;
}
function saveAccessRules() {
  if (!requireAdmin()) return;
  refreshFromStorage();
  for (const role of Object.keys(ROLE_DEFAULTS)) for (const key of Object.keys(PERMISSIONS)) {
    DB.permissions[role][key] = document.getElementById(`perm-${role}-${key}`).checked;
  }
  addLog(currentUser,'Super Admin','System','Department permissions updated','All departments');
  if (saveData()) showToast('Department permissions saved');
}
let editingUsername = null;
function editStaffUser(index) {
  if (!requireAdmin()) return;
  const user = index < 0 ? {username:'',name:'',role:'sales',permissions:{}} : loadUsers()[index];
  if (!user) return;
  editingUsername = index < 0 ? null : user.username;
  document.getElementById('staff-editor').innerHTML = `<form class="sec-card" onsubmit="saveStaffUser(event)"><div class="sec-body">
    <h3>${index<0?'Add Staff Account':'Edit '+htmlEscape(user.username)}</h3><div class="form-grid-3" style="margin-top:16px">
    <div class="form-group"><label for="staff-username">Username *</label><input class="form-control" id="staff-username" required ${index<0?'':'readonly'} value="${htmlEscape(user.username)}" pattern="[A-Za-z0-9_.-]{2,50}"></div>
    <div class="form-group"><label for="staff-name">Full Name *</label><input class="form-control" id="staff-name" required value="${htmlEscape(user.name)}"></div>
    <div class="form-group"><label for="staff-role">Department *</label><select class="form-control" id="staff-role">${Object.entries(ROLES).map(([r,v])=>`<option value="${r}" ${user.role===r?'selected':''}>${htmlEscape(v.label)}</option>`).join('')}</select></div>
    <div class="form-group"><label for="staff-password">${index<0?'Password *':'New Password (blank keeps current)'}</label><input class="form-control" id="staff-password" type="password" autocomplete="new-password" minlength="8" ${index<0?'required':''}></div>
    <label><input id="staff-active" type="checkbox" ${user.active===false?'':'checked'}> Active account</label></div>
    <details><summary>Individual permission overrides (admin always has full access)</summary><div class="form-grid-3" style="margin-top:16px">${Object.entries(PERMISSIONS).map(([key,label])=>`<div class="form-group"><label for="user-perm-${key}">${label}</label><select class="form-control" id="user-perm-${key}"><option value="inherit">Use department</option><option value="allow" ${user.permissions?.[key]===true?'selected':''}>Allow</option><option value="deny" ${user.permissions?.[key]===false?'selected':''}>Deny</option></select></div>`).join('')}</div></details>
    <button class="btn btn-primary" style="margin-top:16px" type="submit">Save User</button></div></form>`;
  document.getElementById('staff-editor').scrollIntoView({behavior:'smooth',block:'start'});
}
function saveStaffUser(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  const users = loadUsers();
  const existing = editingUsername && users.find(u=>u.username === editingUsername);
  const username = document.getElementById('staff-username').value.trim();
  const name = document.getElementById('staff-name').value.trim();
  const role = document.getElementById('staff-role').value;
  const password = document.getElementById('staff-password').value;
  const active = document.getElementById('staff-active').checked;
  if (!/^[A-Za-z0-9_.-]{2,50}$/.test(username) || !name || !ROLES[role]) { alert('Enter a valid username, name and department.'); return; }
  if ((!existing || password) && password.length < 8) { alert('Use a password of at least 8 characters.'); return; }
  if (users.some(u=>u!==existing && u.username.toLowerCase()===username.toLowerCase())) { alert('This username already exists.'); return; }
  if (existing?.username===currentUsername && (!active || role!=='admin')) { alert('Keep your own administrator account active. Use another administrator to change this account.'); return; }
  const permissions = {};
  if (role!=='admin') for (const key of Object.keys(PERMISSIONS)) {
    const value = document.getElementById('user-perm-'+key).value;
    if (value!=='inherit') permissions[key] = value==='allow';
  }
  const updated = {...existing, username, name, role, active, permissions, password:password || existing.password};
  updated.authVersion=(existing?.authVersion||0) + (existing && (password || role!==existing.role || active!== (existing.active!==false)) ? 1 : 0);
  const next = existing ? users.map(u=>u===existing?updated:u) : [...users,updated];
  if (!next.some(u=>u.role==='admin' && u.active!==false)) { alert('At least one active administrator is required.'); return; }
  if (!saveUsers(next)) return;
  if(username===currentUsername) {
    const session=readAuthJson(sessionStorage,SESSION_KEY,null);
    if(session) {session.authVersion=updated.authVersion;sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}
  }
  refreshFromStorage();
  // Preserve ownership when a legacy account's display name changes.
  if (existing) DB.bookings.forEach(b=>{ if (!b.ownerUsername && b.owner===existing.name) b.ownerUsername=existing.username; });
  if (username===currentUsername) currentUser=name;
  addLog(currentUser,'Super Admin',username,existing?'Staff account updated':'Staff account created',ROLES[role].label+(active?' · Active':' · Disabled'));
  saveData(); renderMain(); showToast('Staff account saved');
}
