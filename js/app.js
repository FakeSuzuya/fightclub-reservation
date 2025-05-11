// js/app.js
import { apiRequest } from './api.js';

// Sons
const errorSound   = document.getElementById('errorSound');
const successSound = document.getElementById('successSound');

// Toastr
toastr.options = {
  positionClass: 'toast-bottom-right',
  timeOut: 2500,
  progressBar: true
};

// Polyfill `<dialog>`
['loginPrompt','ticketModal'].forEach(id => {
  const dlg = document.getElementById(id);
  if (dlg && !dlg.showModal) dialogPolyfill.registerDialog(dlg);
});

let adminTable, publicTable, statsChart;
let editingId = null;

// Nettoie le formulaire
function clearForm() {
  editingId = null;
  $('#nom,#prenom,#entreprise').val('');
  $('#type').val('');
  $('#combatForm').prop('checked', false);
  $('#addBtn').html('<i class="fas fa-plus"></i> Ajouter');
  $('#cancelEditBtn').addClass('hidden');
}

// Thème dark/light
function initTheme() {
  const cb      = $('#themeToggleCheckbox');
  const isLight = localStorage.getItem('theme') === 'light';
  document.documentElement.classList.toggle('light-theme', isLight);
  cb.prop('checked', isLight).on('change', () => {
    const on = cb.prop('checked');
    document.documentElement.classList.toggle('light-theme', on);
    localStorage.setItem('theme', on ? 'light' : 'dark');
    successSound.play().catch(()=>{});
  });
}

// Toggle mdp
function initPasswordToggle() {
  $('.toggle-password').click(function() {
    const inp = $('#adminPwd');
    const t   = inp.attr('type') === 'password' ? 'text' : 'password';
    inp.attr('type', t);
    $(this).find('i').toggleClass('fa-eye fa-eye-slash');
  });
}

// DataTables & Chart.js
function initTablesAndChart() {
  adminTable  = $('#adminTable').DataTable({
    responsive: true, searching: false, lengthChange: false
  });
  publicTable = $('#publicTable').DataTable({
    responsive: true, searching: false, lengthChange: false
  });

  const ctx = document.getElementById('statsChart').getContext('2d');
  statsChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Simple','VIP','Premium'],
      datasets:[{ data:[0,0,0], backgroundColor:['#ff007f','#00bcd4','#ffc107'] }]
    },
    options: { plugins:{ legend:{ position:'bottom' } } }
  });
}

// Timestamp
function updateLastRefresh() {
  $('#lastRefresh').text(`Dernière MAJ : ${dayjs().format('DD/MM/YYYY HH:mm:ss')}`);
}

// Charge & affiche
async function loadEntries() {
  try {
    const data = await apiRequest('list');
    adminTable.clear();
    publicTable.clear();
    const counts = { Simple:0, VIP:0, Premium:0 };

    data.forEach(e => {
      // Admin
      adminTable.row.add([
        e.nom, e.prenom, e.type, e.entreprise,
        `<input type="checkbox" disabled ${e.combat?'checked':''}>`,
        `<button class="edit-btn" data-id="${e.id}" data-combat="${e.combat}">
           <i class="fas fa-edit"></i>
         </button>
         <button class="delete-btn" data-id="${e.id}">
           <i class="fas fa-trash"></i>
         </button>
         <button class="ticket-btn"
           data-nom="${e.nom}"
           data-prenom="${e.prenom}"
           data-type="${e.type}"
           data-entreprise="${e.entreprise||''}">
           <i class="fas fa-ticket-alt"></i>
         </button>`
      ]);

      // Publique
      publicTable.row.add([
        e.nom, e.prenom, e.type, e.entreprise,
        `<input type="checkbox" disabled ${e.combat?'checked':''}>`,
        `<button class="ticket-public-btn"
           data-nom="${e.nom}"
           data-prenom="${e.prenom}"
           data-type="${e.type}"
           data-entreprise="${e.entreprise||''}">
           <i class="fas fa-ticket-alt"></i>
         </button>`
      ]);

      // Graph exclut les combattants
      if (!e.combat) counts[e.type] = (counts[e.type]||0) + 1;
    });

    adminTable.draw();
    publicTable.draw();
    statsChart.data.datasets[0].data = [counts.Simple, counts.VIP, counts.Premium];
    statsChart.update();
    updateLastRefresh();

  } catch (err) {
    errorSound.play().catch(()=>{});
    toastr.error('Erreur de chargement');
  }
}

// Affiche/caché bouton tournoi
function toggleTournamentNav(on) {
  $('header button[data-section="tournament"]').toggleClass('hidden', !on);
}

// Login
async function login() {
  const id  = $('#adminId').val().trim();
  const pwd = $('#adminPwd').val().trim();
  if (!id||!pwd) {
    errorSound.play().catch(()=>{});
    return toastr.warning('Identifiant + mot de passe requis');
  }
  $('#loginPrompt')[0].close();
  try {
    const res = await apiRequest('login',{id,pwd});
    if (res.success) {
      switchSection('admin');
      $('#logoutBtn').removeClass('hidden');
      toggleTournamentNav(true);
      successSound.play().catch(()=>{});
      toastr.success('Connexion réussie');
      await loadEntries();
    } else {
      errorSound.play().catch(()=>{});
      Swal.fire('Erreur','Identifiants incorrects','error');
    }
  } catch {
    errorSound.play().catch(()=>{});
    toastr.error('Erreur serveur');
  }
}

// Ajout / modif
async function handleAddOrUpdate() {
  const nom    = $('#nom').val().trim();
  const pre    = $('#prenom').val().trim();
  const type   = $('#type').val();
  const ent    = $('#entreprise').val().trim();
  const combat = $('#combatForm').is(':checked');
  if (!nom||!pre||!type) {
    errorSound.play().catch(()=>{});
    return toastr.warning('Champs requis');
  }
  $('#addBtn').prop('disabled', true);
  try {
    if (editingId) {
      await apiRequest('update',{ id:editingId, nom, prenom:pre, type, entreprise:ent, combat });
      toastr.success('Modification OK');
    } else {
      await apiRequest('add',{ nom, prenom:pre, type, entreprise:ent, combat });
      toastr.success('Ajout OK');
      toggleTournamentNav(true);
    }
    successSound.play().catch(()=>{});
    clearForm();
    await loadEntries();

  } catch {
    errorSound.play().catch(()=>{});
    toastr.error('Erreur serveur');
  } finally {
    $('#addBtn').prop('disabled', false);
  }
}

// Edition
function initEditHandler() {
  $('#adminTable tbody').on('click','.edit-btn',function(){
    editingId = $(this).data('id');
    const combat = $(this).data('combat');
    const row    = adminTable.row($(this).closest('tr')).data();
    $('#nom').val(row[0]);
    $('#prenom').val(row[1]);
    $('#type').val(row[2]);
    $('#entreprise').val(row[3]);
    $('#combatForm').prop('checked', combat);
    $('#addBtn').html('<i class="fas fa-save"></i> Modifier');
    $('#cancelEditBtn').removeClass('hidden');
  });
}

// Suppression
function initDeleteHandler() {
  $('#adminTable tbody').on('click','.delete-btn',async function(){
    const id = $(this).data('id');
    const ans = await Swal.fire({
      title: 'Supprimer ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui', cancelButtonText: 'Non'
    });
    if (!ans.isConfirmed) return;
    try {
      await apiRequest('delete',{id});
      toastr.info('Suppression OK');
      successSound.play().catch(()=>{});
      await loadEntries();
    } catch {
      errorSound.play().catch(()=>{});
      toastr.error('Échec suppression');
    }
  });
}

// Tickets
function initTicketHandler() {
  $('#adminTable').on('click','.ticket-btn, .ticket-public-btn', function(){
    const d = this.dataset;
    $('#ticketAvatar').text(d.prenom.charAt(0).toUpperCase()+d.nom.charAt(0).toUpperCase());
    $('#ticketName').text(`${d.prenom} ${d.nom}`);
    $('#ticketCompany').text(d.entreprise||'-');
    $('#qrcode').empty();
    QRCode.toCanvas(`${d.prenom}|${d.nom}|${d.type}|${d.entreprise}`,{ width:130 },(_,c)=>$('#qrcode').append(c));
    $('#ticketModal')[0].showModal();
  });
}

// Téléchargement QR
function initQRDownload() {
  $('#downloadQRBtn').click(()=>{
    const c = $('#qrcode canvas')[0];
    const link = document.createElement('a');
    link.href = c.toDataURL();
    link.download = 'qrcode.png';
    link.click();
  });
}

// Logout
async function logout() {
  try {
    await apiRequest('logout');
    toastr.info('Déconnecté');
    successSound.play().catch(()=>{});
    switchSection('public');
    $('#logoutBtn').addClass('hidden');
    toggleTournamentNav(false);
  } catch {
    errorSound.play().catch(()=>{});
    toastr.error('Échec déconnexion');
  }
}

// Changer de section
function switchSection(id) {
  $('section').addClass('hidden');
  $(`#${id}`).removeClass('hidden');
}

// Recherche / Filtre
function initManualSearch() {
  $('#searchPublic').on('keyup', ()=>publicTable.search($('#searchPublic').val()).draw());
  $('#filterType').on('change', ()=>publicTable.column(2).search($('#filterType').val()).draw());
  $('#searchAdmin').on('keyup', ()=>adminTable.search($('#searchAdmin').val()).draw());
}

// On ready
$(document).ready(()=>{
  initTheme();
  initPasswordToggle();
  initTablesAndChart();

  toggleTournamentNav(false);

  $('header button[data-section]').click(e=>{
    const s = e.currentTarget.dataset.section;
    if (s==='login') $('#loginPrompt')[0].showModal();
    else switchSection(s);
  });

  $('#loginBtn').click(login);
  $('#logoutBtn').click(logout);
  $('#addBtn').click(handleAddOrUpdate);
  $('#cancelEditBtn').click(clearForm);

  initEditHandler();
  initDeleteHandler();
  initTicketHandler();
  initQRDownload();
  initManualSearch();

  loadEntries();
  setInterval(loadEntries, 10_000);
});
