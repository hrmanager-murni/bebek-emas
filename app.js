import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const appId = 'bebek-emas-pos-v3'; 

const firebaseConfig = {
    apiKey: "AIzaSyCRH_6JZoRvKRgbEU_WNNtSOFZ2d83kfys",
    authDomain: "bebek-emas.firebaseapp.com",
    projectId: "bebek-emas",
    storageBucket: "bebek-emas.firebasestorage.app",
    messagingSenderId: "50335358089",
    appId: "1:50335358089:web:4cdae41ba35803c5f53a58"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const getColRef = (colName) => collection(db, 'artifacts', appId, 'public', 'data', colName);
const getDocRef = (colName, docId) => doc(db, 'artifacts', appId, 'public', 'data', colName, docId);

let currentUser = null;
let accountsDB = [], menusDB = [], stocksDB = [], transactionsDB = [], expensesDB = [], mutasiDB = [], closeRegistersDB = [], savedBillsDB = [], requestsDB = [], trashedBillsDB = [];
let cart = [], tipeOrder = 'DineIn', isCloudReady = false;
let discountInfo = { type: '%', value: 0, amount: 0 }; 
let subtotalCart = 0;
let activeKategoriKasir = 'ALL';
let mutasiDraftHariIni = [];
let mutasiSaveTimeout = null;

window.arsipData = { transactions: [], expenses: [], close_registers: [], stock_mutations: [] };
window.thermalPrinter = null; 
window.lastPrintedPayload = null;
window.mutasiDrafts = JSON.parse(localStorage.getItem('mutasiDrafts')) || {};

// UTILITIES
const formatIDR = (num) => "Rp " + (parseFloat(num) || 0).toLocaleString('id-ID');
const formatIDRPlain = (num) => (parseFloat(num) || 0).toLocaleString('id-ID');
const formatDec = (num) => parseFloat(Number(num).toFixed(1));
const getTodayYMD = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; };
const getTimestampStr = () => { const d = new Date(); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; };

window.getCleanNumber = (val) => { 
    if (!val) return 0; 
    if (typeof val === 'number') return val; 
    return parseFloat(val.toString().replace(/\./g, '')) || 0; 
};

window.formatNumberInput = (el) => { 
    let val = el.value.replace(/[^0-9]/g, ''); 
    if (val !== '') el.value = parseInt(val, 10).toLocaleString('id-ID'); 
    else el.value = ''; 
};

window.showLoading = (msg) => { 
    document.getElementById('loadingText').innerText = msg || 'MEMPROSES...'; 
    const ov = document.getElementById('loadingOverlay'); 
    ov.classList.remove('hidden'); 
    setTimeout(() => ov.classList.remove('opacity-0'), 10); 
};

window.hideLoading = () => { 
    const ov = document.getElementById('loadingOverlay'); 
    ov.classList.add('opacity-0'); 
    setTimeout(() => ov.classList.add('hidden'), 300); 
};

window.showToast = (msg, type = 'info') => { 
    const toast = document.getElementById('toast'); 
    document.getElementById('toastMsg').innerText = msg; 
    toast.className = `fixed top-4 right-4 z-[110] px-4 py-3 rounded-xl shadow-2xl text-xs uppercase tracking-widest font-black flex items-center space-x-3 border transition-all duration-300 transform scale-100 opacity-100 ${type === 'error' ? 'bg-rose-500 text-white border-rose-600' : 'bg-emerald-500 text-slate-900 border-emerald-400'}`; 
    setTimeout(() => { 
        toast.classList.remove('scale-100', 'opacity-100'); 
        toast.classList.add('scale-95', 'opacity-0'); 
        setTimeout(() => toast.classList.add('hidden'), 300); 
    }, 3500); 
};

window.showModal = (title, body, onConfirm) => { 
    document.getElementById('modalTitle').innerText = title; 
    document.getElementById('modalBody').innerText = body; 
    const btnConfirm = document.getElementById('modalBtnConfirm'); 
    const newBtn = btnConfirm.cloneNode(true); 
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm); 
    newBtn.onclick = async () => { window.closeModal(); await onConfirm(); }; 
    document.getElementById('customModal').classList.remove('hidden'); 
};
window.closeModal = () => document.getElementById('customModal').classList.add('hidden');

// PRINTER & BLUETOOTH
window.connectPrinter = async () => {
    try {
        if (!navigator.bluetooth) return showToast("Browser tidak dukung Web Bluetooth", "error");
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'] });
        const server = await device.gatt.connect(); 
        window.thermalPrinter = server; 
        showToast("Printer " + device.name + " terhubung!", "success");
        const btn = document.getElementById('btnPrinterStatus'); 
        btn.innerHTML = `<i class="fas fa-print"></i><span class="hidden sm:inline ml-1">PRINTER AKTIF</span>`; 
        btn.classList.replace('bg-slate-800', 'bg-emerald-500/20'); 
        btn.classList.replace('text-slate-300', 'text-emerald-400'); 
        btn.classList.replace('border-slate-700', 'border-emerald-500/50');
    } catch (err) { 
        console.error(err); 
        showToast("Batal hubungkan printer.", "error"); 
    }
};

window.printReceiptAction = async () => {
    if (window.thermalPrinter && window.thermalPrinter.connected && window.lastPrintedPayload) {
        try {
            showToast("Mencetak...", "info"); 
            const services = await window.thermalPrinter.getPrimaryServices();
            if (services.length > 0) {
                const service = services[0]; 
                const characteristics = await service.getCharacteristics();
                if (characteristics.length > 0) {
                    const char = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse) || characteristics[0];
                    let enc = new TextEncoder(); 
                    let p = window.lastPrintedPayload; 
                    let escpos = [0x1B, 0x40, 0x1B, 0x61, 0x01]; 
                    
                    escpos.push(...enc.encode("PAWON NUSANTARA\nJl. ST Aminuddin\n0821 5431 6995\n")); 
                    escpos.push(...enc.encode(p.waktu + "\n"));
                    escpos.push(0x1B, 0x61, 0x00); 
                    escpos.push(...enc.encode("-".repeat(32) + "\n"));
                    escpos.push(...enc.encode("Nota: #" + p.noNota + "  Kasir: " + p.kasir + "\n")); 
                    escpos.push(...enc.encode("Cust: " + p.customer + "/" + p.meja + "\n"));
                    escpos.push(...enc.encode("-".repeat(32) + "\n"));
                    
                    p.cart.forEach(c => { 
                        let harga = p.tipeOrder === 'DineIn' ? c.hargaDineIn : c.hargaGojek; 
                        escpos.push(...enc.encode(`${c.nama} x${c.qty}\n    ${formatIDRPlain(harga * c.qty)}\n`)); 
                    });
                    
                    escpos.push(...enc.encode("-".repeat(32) + "\n"));
                    escpos.push(...enc.encode(`Subtotal: ${formatIDRPlain(p.subtotal)}\n`)); 
                    escpos.push(...enc.encode(`Diskon  : -${formatIDRPlain(p.diskonRp)}\n`));
                    
                    let totalCetak = p.totalBayar !== undefined ? p.totalBayar : (p.subtotal - p.diskonRp);
                    escpos.push(...enc.encode(`TOTAL   : ${formatIDRPlain(totalCetak)}\n`)); 
                    escpos.push(...enc.encode(`Tipe    : ${p.tipeOrder}\n`));
                    
                    if(p.pembayaran === 'MIX') {
                        escpos.push(...enc.encode(`Bayar   : MIX\nCASH    : ${formatIDRPlain(p.mixCash)}\nTF      : ${formatIDRPlain(p.mixTf)}\n`));
                    } else {
                        escpos.push(...enc.encode(`Bayar   : ${p.pembayaran}\n`));
                    }
                    
                    escpos.push(...enc.encode("-".repeat(32) + "\n")); 
                    escpos.push(0x1B, 0x61, 0x01); 
                    escpos.push(...enc.encode("TERIMA KASIH\n\n\n\n\n")); 

                    let data = new Uint8Array(escpos);
                    for (let i = 0; i < data.length; i += 20) { 
                        if (char.properties.writeWithoutResponse) await char.writeValueWithoutResponse(data.slice(i, i + 20)); 
                        else await char.writeValue(data.slice(i, i + 20)); 
                    }
                    showToast("Selesai mencetak!", "success"); 
                    return; 
                }
            }
        } catch(e) { 
            console.error("Print error:", e); 
        }
    } 
    window.print();
};

window.cetakStrukPreview = (payload) => {
    document.getElementById('strukWaktu').innerText = payload.waktu;
    document.getElementById('strukNota').innerText = "Nota: #" + payload.noNota;
    document.getElementById('strukKasir').innerText = "Kasir: " + payload.kasir;
    document.getElementById('strukCustomerDetail').innerText = payload.customer + " / " + payload.meja;
    
    let itemsHtml = '';
    payload.cart.forEach(c => {
        let harga = payload.tipeOrder === 'DineIn' ? c.hargaDineIn : c.hargaGojek;
        itemsHtml += `<div class="flex justify-between"><span>${c.nama} x${c.qty}</span><span>${formatIDRPlain(harga * c.qty)}</span></div>`;
    });
    document.getElementById('strukItems').innerHTML = itemsHtml;
    
    document.getElementById('strukSubtotal').innerText = formatIDRPlain(payload.subtotal);
    document.getElementById('strukDiskon').innerText = "- " + formatIDRPlain(payload.diskonRp);
    
    const gojekRow = document.getElementById('strukGojekRow');
    if(payload.tipeOrder === 'Gojek' && payload.gojekFee > 0) {
        gojekRow.classList.remove('hidden');
        document.getElementById('strukGojekFee').innerText = "- " + formatIDRPlain(payload.gojekFee);
    } else {
        gojekRow.classList.add('hidden');
    }
    
    document.getElementById('strukTipe').innerText = payload.tipeOrder;
    document.getElementById('strukMetode').innerText = payload.pembayaran;
    
    let totalCetak = payload.totalBayar !== undefined ? payload.totalBayar : (payload.subtotal - payload.diskonRp);
    document.getElementById('strukTotal').innerText = formatIDRPlain(totalCetak);
    
    document.getElementById('modalStruk').classList.remove('hidden');
};

function getGojekFee(totalAfterDisc) {
    if (totalAfterDisc <= 0) return { fee: 0, finalTotal: 0 };
    const fee = (totalAfterDisc * 0.20) + 1000;
    return { fee: fee, finalTotal: Math.floor((totalAfterDisc - fee) / 1000) * 1000 };
}

// INIT APP & SYNC
async function initApp() { 
    showLoading("MENGAMANKAN KONEKSI CLOUD..."); 
    try { 
        await signInAnonymously(auth); 
        setupRealtimeSync(); 
    } catch (err) { 
        console.error(err); 
        showToast("Koneksi gagal.", "error"); 
        hideLoading(); 
    } 
}

function setupRealtimeSync() {
    const d = new Date(); d.setDate(d.getDate() - 30); 
    const thirtyDaysAgo = d.toISOString().split('T')[0];
    
    const handleSync = (col) => {
        let dbRef = getColRef(col);
        if (['transactions', 'expenses', 'stock_mutations', 'close_registers'].includes(col)) {
            dbRef = query(getColRef(col), where('tanggal', '>=', thirtyDaysAgo));
        }

        onSnapshot(dbRef, snap => {
            const realtimeData = snap.docs.map(docItem => ({id: docItem.id, ...docItem.data()}));
            let dataToUse = realtimeData;
            
            if (window.arsipData[col] && window.arsipData[col].length > 0) { 
                const merged = [...window.arsipData[col], ...realtimeData]; 
                dataToUse = Array.from(new Map(merged.map(item => [item.id, item])).values()); 
            }

            if(col === 'accounts') { accountsDB = dataToUse; if(!isCloudReady){ isCloudReady=true; hideLoading();} }
            if(col === 'menus') { menusDB = dataToUse; if(currentUser && ['kasir','admin'].includes(currentUser.role)){ renderKategoriFilterKasir(); renderKasirMenu(); renderKelolaMenu(); } }
            if(col === 'stocks') { stocksDB = dataToUse; if(currentUser) { renderKelolaStok(); if(!document.getElementById('view-mutasistok').classList.contains('hidden')) loadMutasiDataUI(); if(currentUser.role === 'admin' && !document.getElementById('view-dashboard').classList.contains('hidden')) renderManagerDashboard(); } }
            if(col === 'transactions') { transactionsDB = dataToUse; if(currentUser && ['kasir','admin'].includes(currentUser.role)) { if(!document.getElementById('view-laporan').classList.contains('hidden')) renderLaporanUI(); } }
            if(col === 'expenses') { expensesDB = dataToUse; if(currentUser && ['kasir','admin'].includes(currentUser.role)) { if(!document.getElementById('view-pengeluaran').classList.contains('hidden')) renderPengeluaranUI(); } }
            if(col === 'close_registers') { closeRegistersDB = dataToUse; if(currentUser && currentUser.role === 'admin' && !document.getElementById('view-tutupbuku').classList.contains('hidden')) renderManagerTutupBuku(); }
            if(col === 'stock_mutations') { mutasiDB = dataToUse; if(currentUser && currentUser.role === 'admin') { if(!document.getElementById('view-mutasistok').classList.contains('hidden')) renderManagerMutasi(); if(!document.getElementById('view-dashboard').classList.contains('hidden')) renderManagerDashboard(); } if(currentUser && currentUser.role !== 'admin' && !document.getElementById('view-mutasistok').classList.contains('hidden')) loadMutasiDataUI(); }
            if(col === 'saved_bills') { savedBillsDB = dataToUse; if(currentUser && ['kasir','admin'].includes(currentUser.role)){ document.getElementById('badgeSavedBills').innerText = dataToUse.length; document.getElementById('badgeSavedBills').classList.toggle('hidden', dataToUse.length === 0); if(!document.getElementById('view-notatersimpan').classList.contains('hidden')) renderSavedBillsUI(); } }
            if(col === 'requests') { requestsDB = dataToUse; if(currentUser && currentUser.role === 'admin' && !document.getElementById('view-dashboard').classList.contains('hidden')) renderManagerDashboard(); if(currentUser && currentUser.role !== 'admin' && !document.getElementById('view-mutasistok').classList.contains('hidden')) loadMutasiDataUI(); }
            // TAMBAHAN SINKRONISASI TONG SAMPAH
            if(col === 'trashed_bills') { trashedBillsDB = dataToUse; if(currentUser && currentUser.role === 'kasir' && !document.getElementById('view-tongsampah').classList.contains('hidden')) window.renderTrashUI(); }
        }, err => console.error(err));
    };
    
    handleSync('accounts'); handleSync('menus'); handleSync('stocks'); 
    handleSync('transactions'); handleSync('expenses'); handleSync('close_registers'); 
    handleSync('stock_mutations'); handleSync('saved_bills'); handleSync('requests'); handleSync('trashed_bills'); // TAMBAH DISINI JUGA
};

// LOGIN & AUTHENTICATION
window.loginAs = async (username, role) => {
    if (!isCloudReady) return showToast("Mohon tunggu, sinkronisasi...", "error");
    let acc = accountsDB.find(a => a.username === username);
    if (!acc) return showToast("Akun belum terdaftar di database!", "error");
    proceedLogin(acc);
};

window.openManagerPasswordModal = () => {
    document.getElementById('modalManagerPass').classList.remove('hidden');
};

window.loginManager = async () => {
    const pass = document.getElementById('inputPassManager').value; 
    let adminAcc = accountsDB.find(a => a.role === 'admin');
    
    if(!adminAcc) return showToast('Otorisasi gagal! Akun Manager tidak ditemukan.', 'error');
    
    if (pass === adminAcc.pass) { 
        document.getElementById('modalManagerPass').classList.add('hidden'); 
        proceedLogin(adminAcc); 
    } else { 
        showToast('Otorisasi gagal! Password salah.', 'error'); 
    }
};

function proceedLogin(accountData) {
    currentUser = accountData; 
    document.getElementById('labelUserRole').innerText = currentUser.nama + " (" + currentUser.role + ")"; 
    document.getElementById('viewLanding').classList.add('hidden');
    
    const allTabs = ['dashboard', 'rekapmenu', 'kasir', 'notatersimpan', 'laporan', 'pengeluaran', 'tutupbuku', 'kelolamenu', 'kelolastok', 'mutasistok', 'laporanstok', 'tongsampah'];
    allTabs.forEach(t => document.getElementById(`tab-${t}`).classList.add('hidden'));

    if (currentUser.role === 'admin') {
        ['dashboard', 'rekapmenu', 'tutupbuku', 'kelolastok', 'mutasistok', 'laporanstok'].forEach(t => document.getElementById(`tab-${t}`).classList.remove('hidden'));
        window.switchTab('dashboard');
        document.getElementById('dashStartDate').value = getTodayYMD(); 
        document.getElementById('dashEndDate').value = getTodayYMD();
        document.getElementById('rmStartDate').value = getTodayYMD(); 
        document.getElementById('rmEndDate').value = getTodayYMD();
        
        const dStart = new Date(); dStart.setDate(dStart.getDate() - 6); 
        document.getElementById('lsStartDate').value = dStart.toISOString().split('T')[0]; 
        document.getElementById('lsEndDate').value = getTodayYMD();
        
        if(!document.getElementById('btnArsipKuno')) { 
            const btn = document.createElement('button'); 
            btn.id = 'btnArsipKuno'; 
            btn.innerHTML = '<i class="fas fa-cloud-download-alt text-lg"></i><span class="ml-2">Tarik Arsip Lama</span>'; 
            btn.className = 'fixed bottom-6 right-6 z-[90] bg-slate-900 text-amber-400 px-5 py-3.5 rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)] font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition transform hover:-translate-y-1 border border-slate-700 flex items-center justify-center'; 
            btn.onclick = () => document.getElementById('modalArsip').classList.remove('hidden'); 
            document.body.appendChild(btn); 
        }
    } else {
        const btn = document.getElementById('btnArsipKuno'); 
        if(btn) btn.remove();
        
        if (currentUser.role === 'kasir') {
            ['kasir', 'notatersimpan', 'laporan', 'pengeluaran', 'tutupbuku', 'kelolamenu', 'tongsampah'].forEach(t => document.getElementById(`tab-${t}`).classList.remove('hidden'));
            window.switchTab('kasir'); 
            document.getElementById('filterTglLaporan').value = getTodayYMD(); 
            let dateInput = document.getElementById('tbInputTanggal'); 
            if(dateInput) dateInput.value = getTodayYMD();
            renderKategoriFilterKasir(); 
            renderKasirMenu(); 
            renderKelolaMenu(); 
            document.getElementById('badgeSavedBills').innerText = savedBillsDB.length; 
            document.getElementById('badgeSavedBills').classList.toggle('hidden', savedBillsDB.length === 0);
        } else {
            ['kelolastok', 'mutasistok'].forEach(t => document.getElementById(`tab-${t}`).classList.remove('hidden'));
            document.getElementById('filterTglMutasi').value = getTodayYMD(); 
            window.switchTab('kelolastok'); 
            renderKelolaStok();
        }
    }
    showToast(`Akses diberikan. Selamat bekerja, ${currentUser.nama}!`);
}

window.logout = () => { 
    currentUser = null; 
    window.clearCart(); 
    document.getElementById('inputPassManager').value = ''; 
    document.getElementById('viewLanding').classList.remove('hidden'); 
    const btn = document.getElementById('btnArsipKuno'); 
    if(btn) btn.remove(); 
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(b => { 
        b.classList.remove('border-amber-500', 'text-amber-600'); 
        b.classList.add('border-transparent', 'text-slate-500'); 
    });
    const activeTab = document.getElementById(`tab-${tabName}`); 
    if(activeTab) { 
        activeTab.classList.remove('border-transparent', 'text-slate-500'); 
        activeTab.classList.add('border-amber-500', 'text-amber-600'); 
    }
    
    document.querySelectorAll('.view-panel').forEach(v => v.classList.add('hidden')); 
    const activeView = document.getElementById(`view-${tabName}`); 
    if(activeView) activeView.classList.remove('hidden');

    if (tabName === 'laporan') window.renderLaporanUI();
    else if (tabName === 'pengeluaran') window.renderPengeluaranUI();
    else if (tabName === 'tutupbuku') window.renderTutupBukuUI();
    else if (tabName === 'mutasistok') window.loadMutasiDataUI();
    else if (tabName === 'laporanstok') window.renderLaporanStokUI();
    else if (tabName === 'notatersimpan') window.renderSavedBillsUI();
    else if (tabName === 'dashboard') window.renderManagerDashboard();
    else if (tabName === 'rekapmenu') window.renderRekapMenuTab();
    else if (tabName === 'kelolastok') window.renderKelolaStok();
    else if (tabName === 'tongsampah') window.renderTrashUI();
};

// DISKON
window.openDiscountModal = () => { 
    document.getElementById('inputDiscountVal').value = discountInfo.value ? discountInfo.value.toLocaleString('id-ID') : ''; 
    setDiscountType(discountInfo.type); 
    document.getElementById('modalDiskon').classList.remove('hidden'); 
};
window.closeDiscountModal = () => document.getElementById('modalDiskon').classList.add('hidden');
window.setDiscountType = (type) => { 
    discountInfo.type = type; 
    document.getElementById('btnDiscPercent').className = type === '%' ? 'flex-1 py-2 rounded-lg text-xs font-black bg-white shadow-sm text-rose-600 transition' : 'flex-1 py-2 rounded-lg text-xs font-black text-slate-500 hover:text-slate-700 transition'; 
    document.getElementById('btnDiscNominal').className = type === 'Rp' ? 'flex-1 py-2 rounded-lg text-xs font-black bg-white shadow-sm text-rose-600 transition' : 'flex-1 py-2 rounded-lg text-xs font-black text-slate-500 hover:text-slate-700 transition'; 
};
window.applyDiscount = () => { 
    discountInfo.value = getCleanNumber(document.getElementById('inputDiscountVal').value); 
    window.closeDiscountModal(); 
    window.renderCart(); 
};

// SIMPAN NOTA (TUNDA)
window.bukaModalSimpanNota = () => { 
    if(cart.length === 0) return showToast("Pesanan kosong!", "error"); 
    let cust = document.getElementById('cartCustomer').value; 
    let meja = document.getElementById('cartMeja').value; 
    let autoName = "";
    if(cust && meja) autoName = cust + " - " + meja; 
    else if (cust) autoName = cust; 
    else if (meja) autoName = "Meja " + meja;
    document.getElementById('inputParkName').value = autoName; 
    document.getElementById('modalParkBill').classList.remove('hidden'); 
};

window.closeParkModal = () => document.getElementById('modalParkBill').classList.add('hidden');
window.simpanNotaTunda = async () => {
    const name = document.getElementById('inputParkName').value || 'Tanpa Nama'; 
    if(!auth.currentUser) return; 
    showLoading("Menyimpan...");
    
    await addDoc(getColRef('saved_bills'), { 
        waktu: getTimestampStr(), 
        timestamp: Date.now(), 
        kasir: currentUser.nama, 
        namaTunda: name, 
        customer: document.getElementById('cartCustomer').value || 'Umum', 
        meja: document.getElementById('cartMeja').value || '-', 
        cart: cart, 
        tipeOrder: tipeOrder, 
        discountInfo: discountInfo 
    });
    
    hideLoading(); 
    showToast("Nota disimpan!"); 
    window.closeParkModal(); 
    window.clearCart();
};

window.renderSavedBillsUI = () => {
    const container = document.getElementById('savedBillsContainer'); container.innerHTML = '';
    if(savedBillsDB.length === 0) { 
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-bold bg-white border border-slate-200 border-dashed rounded-3xl"><i class="fas fa-folder-open text-4xl mb-3 opacity-50 block"></i>Tidak ada nota yang tertunda.</div>`; 
        return; 
    }
    savedBillsDB.sort((a,b)=> b.timestamp - a.timestamp).forEach(sb => {
        let itemsPreview = sb.cart.map(c=>c.nama).slice(0,2).join(', '); 
        if(sb.cart.length > 2) itemsPreview += ` (+${sb.cart.length-2} item)`;
        
        container.innerHTML += `<div class="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-amber-400 transition"><div><div class="flex justify-between items-start mb-2"><span class="px-2.5 py-1 bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-lg">${sb.waktu.substring(11,16)}</span><span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${sb.tipeOrder}</span></div><h4 class="text-sm font-black text-slate-800 mb-1 leading-tight">${sb.namaTunda}</h4><p class="text-[10px] text-slate-500 font-medium">${itemsPreview}</p></div><div class="flex space-x-2 mt-4 pt-4 border-t border-slate-100"><button onclick="bukaSavedBill('${sb.id}')" class="flex-1 py-2.5 bg-slate-900 hover:bg-amber-50 text-white hover:text-slate-900 font-black text-xs uppercase tracking-widest rounded-xl transition shadow-sm">Buka Nota</button><button onclick="hapusSavedBill('${sb.id}')" class="w-10 h-10 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition flex items-center justify-center border border-rose-100"><i class="fas fa-trash-alt"></i></button></div></div>`;
    });
};

window.bukaSavedBill = async (id) => { 
    if(cart.length > 0) return showToast("Kosongkan keranjang dulu!", "error"); 
    const sb = savedBillsDB.find(s=>s.id===id); 
    if(!sb) return; 
    
    cart = sb.cart; 
    tipeOrder = sb.tipeOrder; 
    discountInfo = sb.discountInfo || { type: '%', value: 0, amount: 0 }; 
    document.getElementById('cartCustomer').value = sb.customer; 
    document.getElementById('cartMeja').value = sb.meja; 
    
    showLoading("Membuka..."); 
    await deleteDoc(getDocRef('saved_bills', id)); 
    hideLoading(); 
    
    window.switchTab('kasir'); 
    window.renderCart(); 
};

window.hapusSavedBill = (id) => { 
    window.showModal("Pindah ke Tong Sampah", "Pindahkan nota tunda ini ke tong sampah?", async () => { 
        if(!auth.currentUser) return; 
        const sb = savedBillsDB.find(s=>s.id===id);
        if(sb) {
            await addDoc(getColRef('trashed_bills'), { ...sb, deleteTimestamp: Date.now(), originalSource: 'saved_bills' });
            await deleteDoc(getDocRef('saved_bills', id)); 
            showToast("Dipindah ke Tong Sampah."); 
        }
    }); 
};

// KASIR & KERANJANG
window.renderKategoriFilterKasir = () => {
    const container = document.getElementById('containerFilterKategoriKasir'); 
    if(!container) return;
    
    const standardKategories = ['MAKANAN', 'MINUMAN', 'TAMBAHAN']; 
    let allKats = [...new Set(menusDB.map(m => m.kategori.toUpperCase()))]; 
    allKats = [...new Set([...standardKategories, ...allKats])]; 
    
    let html = `<button onclick="setFilterKategoriKasir('ALL')" id="btnKat-ALL" class="btn-kat-kasir px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition whitespace-nowrap ${activeKategoriKasir === 'ALL' ? 'bg-amber-50 text-amber-600 shadow-sm border border-amber-200' : 'text-slate-500 hover:bg-slate-50'}">SEMUA</button>`;
    allKats.forEach(kat => { 
        html += `<button onclick="setFilterKategoriKasir('${kat}')" id="btnKat-${kat}" class="btn-kat-kasir px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition whitespace-nowrap ${activeKategoriKasir === kat ? 'bg-amber-50 text-amber-600 shadow-sm border border-amber-200' : 'text-slate-500 hover:bg-slate-50'}">${kat}</button>`; 
    });
    container.innerHTML = html;
};

window.setFilterKategoriKasir = (kat) => { 
    activeKategoriKasir = kat; 
    renderKategoriFilterKasir(); 
    renderKasirMenu(); 
};

window.renderKasirMenu = () => {
    const container = document.getElementById('containerMenuKasir'); 
    const keyword = document.getElementById('searchMenu').value.toLowerCase(); 
    container.innerHTML = '';
    
    let filtered = menusDB.filter(m => m.nama.toLowerCase().includes(keyword) && (activeKategoriKasir === 'ALL' || m.kategori.toUpperCase() === activeKategoriKasir)); 
    filtered.sort((a, b) => (parseInt(a.urutan) || 999) - (parseInt(b.urutan) || 999));
    
    const standardKategories = ['MAKANAN', 'MINUMAN', 'TAMBAHAN']; 
    let allKats = [...new Set(filtered.map(m => m.kategori.toUpperCase()))];
    
    allKats.sort((a,b) => { 
        let aIdx = standardKategories.indexOf(a); 
        let bIdx = standardKategories.indexOf(b); 
        aIdx = aIdx === -1 ? 99 : aIdx; bIdx = bIdx === -1 ? 99 : bIdx; 
        return aIdx - bIdx; 
    });
    
    allKats.forEach(kategori => {
        let itemsInGroup = filtered.filter(m => m.kategori.toUpperCase() === kategori); 
        if (itemsInGroup.length === 0) return;
        
        let html = `<div class="mb-4"><h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-200 flex items-center"><i class="fas fa-tag mr-2 text-amber-500"></i>${kategori}</h4><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">`;
        
        itemsInGroup.forEach(item => { 
            const harga = tipeOrder === 'DineIn' ? item.hargaDineIn : item.hargaGojek; 
            html += `<div onclick="addToCart('${item.id}')" class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-400 hover:-translate-y-1 transition cursor-pointer flex flex-col justify-between group h-24 relative overflow-hidden"><div class="absolute -right-4 -top-4 w-10 h-10 bg-slate-50 rounded-full group-hover:bg-amber-100 transition duration-500 -z-10"></div><div><h4 class="font-bold text-xs text-slate-800 mt-1 leading-snug line-clamp-2">${item.nama}</h4></div><div class="flex items-end justify-between mt-1"><span class="text-xs font-black text-amber-600 tracking-tight leading-none">${formatIDR(harga)}</span></div></div>`; 
        });
        html += `</div></div>`; 
        container.innerHTML += html;
    });
};

window.setTipeOrder = (tipe) => { 
    tipeOrder = tipe; 
    document.getElementById('btnDineIn').className = tipe === 'DineIn' ? 'px-4 py-2 rounded-lg text-[10px] font-black bg-amber-500 text-slate-900 tracking-wider shadow-sm transition' : 'px-4 py-2 rounded-lg text-[10px] font-black text-slate-500 hover:text-slate-800 tracking-wider transition'; 
    document.getElementById('btnGojek').className = tipe === 'Gojek' ? 'px-4 py-2 rounded-lg text-[10px] font-black bg-amber-500 text-slate-900 tracking-wider shadow-sm transition' : 'px-4 py-2 rounded-lg text-[10px] font-black text-slate-500 hover:text-slate-800 tracking-wider transition'; 
    window.renderKasirMenu(); 
    window.renderCart(); 
};

window.addToCart = (id) => { 
    const menu = menusDB.find(m => m.id === id); 
    if (!menu) return; 
    const existing = cart.find(c => c.id === id); 
    if (existing) existing.qty++; 
    else cart.push({ id: menu.id, nama: menu.nama, hargaDineIn: parseFloat(menu.hargaDineIn), hargaGojek: parseFloat(menu.hargaGojek), qty: 1 }); 
    window.renderCart(); 
};

window.updateQty = (index, delta) => { 
    cart[index].qty += delta; 
    if (cart[index].qty <= 0) cart.splice(index, 1); 
    window.renderCart(); 
};

window.clearCart = () => { 
    cart = []; 
    document.getElementById('cartCustomer').value = ''; 
    document.getElementById('cartMeja').value = ''; 
    discountInfo = { type: '%', value: 0, amount: 0 }; 
    window.renderCart(); 
};

window.renderCart = () => {
    const container = document.getElementById('cartItemsContainer'); 
    if (cart.length === 0) { 
        container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 opacity-60"><i class="fas fa-basket-shopping text-5xl"></i><p class="text-[10px] font-black uppercase tracking-widest">Keranjang Kosong</p></div>`; 
        document.getElementById('cartTotalText').innerText = "Rp 0"; 
        document.getElementById('cartDiscountText').innerText = "- Rp 0"; 
        return; 
    }
    
    container.innerHTML = ''; 
    subtotalCart = 0;
    
    cart.forEach((item, index) => {
        const harga = tipeOrder === 'DineIn' ? item.hargaDineIn : item.hargaGojek; 
        subtotalCart += harga * item.qty;
        container.innerHTML += `<div class="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200 text-xs shadow-sm"><div class="flex-1 pr-2"><h5 class="font-bold text-slate-800 leading-tight">${item.nama}</h5><span class="text-[10px] text-amber-600 font-black tracking-widest">${formatIDR(harga)}</span></div><div class="flex items-center space-x-1 bg-slate-50 rounded-xl p-1 border border-slate-100"><button onclick="updateQty(${index}, -1)" class="w-6 h-6 hover:bg-white text-slate-600 rounded-lg font-black flex items-center justify-center shadow-sm transition"><i class="fas fa-minus text-[10px]"></i></button><span class="font-black text-slate-800 w-5 text-center">${item.qty}</span><button onclick="updateQty(${index}, 1)" class="w-6 h-6 hover:bg-white text-slate-600 rounded-lg font-black flex items-center justify-center shadow-sm transition"><i class="fas fa-plus text-[10px]"></i></button></div></div>`;
    });
    
    discountInfo.amount = discountInfo.type === '%' ? (subtotalCart * (discountInfo.value / 100)) : discountInfo.value; 
    if(discountInfo.amount > subtotalCart) discountInfo.amount = subtotalCart;
    
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    let finalTotal = totalAfterDisc;
    
    if(tipeOrder === 'Gojek') { 
        const gojekInfo = getGojekFee(totalAfterDisc); 
        finalTotal = gojekInfo.finalTotal; 
    }

    document.getElementById('cartDiscountText').innerText = `- ${formatIDR(discountInfo.amount)}`; 
    document.getElementById('cartTotalText').innerText = formatIDR(finalTotal);
};

// MIX PAY
window.bukaMixPay = () => {
    if(cart.length === 0) return showToast("Keranjang kosong!", "error");
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    if (tipeOrder === 'Gojek') { 
        const g = getGojekFee(totalAfterDisc); 
        totalAfterDisc = g.finalTotal; 
    }
    document.getElementById('mixTotalTagihan').innerText = formatIDR(totalAfterDisc); 
    document.getElementById('mixInputCash').value = ''; 
    document.getElementById('mixSisaTf').innerText = formatIDR(totalAfterDisc); 
    document.getElementById('modalMixPay').classList.remove('hidden');
};

window.hitungMixTf = () => {
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    if (tipeOrder === 'Gojek') { 
        const g = getGojekFee(totalAfterDisc); 
        totalAfterDisc = g.finalTotal; 
    }
    let cashPay = getCleanNumber(document.getElementById('mixInputCash').value); 
    let sisa = totalAfterDisc - cashPay; 
    if (sisa < 0) sisa = 0; 
    document.getElementById('mixSisaTf').innerText = formatIDR(sisa);
};

window.prosesMixPay = () => {
    let cashPay = getCleanNumber(document.getElementById('mixInputCash').value); 
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    if (tipeOrder === 'Gojek') { 
        const g = getGojekFee(totalAfterDisc); 
        totalAfterDisc = g.finalTotal; 
    }
    let tfPay = totalAfterDisc - cashPay; 
    if (cashPay <= 0 || tfPay <= 0) return showToast("Masukan Nominal Mix Pay Tidak Valid!", "error"); 
    
    document.getElementById('modalMixPay').classList.add('hidden'); 
    prosesBayar('MIX', cashPay, tfPay);
};

// PROSES BAYAR UTAMA
window.prosesBayar = async (metode, mixCash = 0, mixTf = 0) => {
    if (!auth.currentUser) return showToast("Sistem offline.", "error"); 
    if (cart.length === 0) return showToast('Keranjang kosong!', 'error'); 
    
    showLoading("Menyimpan...");
    
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    let finalNetTotal = totalAfterDisc; 
    let gojekFee = 0; 
    
    if (tipeOrder === 'Gojek') { 
        const g = getGojekFee(totalAfterDisc); 
        finalNetTotal = g.finalTotal; 
        gojekFee = g.fee; 
    }
    
    const dateStr = getTodayYMD(); 
    const todayTrx = transactionsDB.filter(t => t.tanggal === dateStr); 
    const noNota = (todayTrx.length + 1).toString().padStart(2, '0');
    
    const payload = { 
        waktu: getTimestampStr(), 
        tanggal: dateStr, 
        timestamp: Date.now(), 
        kasir: (currentUser.nama === 'Manager Executive' ? 'Manager (Bantuan Kasir)' : currentUser.nama), 
        tipeOrder: tipeOrder, 
        pembayaran: metode, 
        total: finalNetTotal, 
        totalBayar: totalAfterDisc, 
        subtotal: subtotalCart, 
        diskonRp: discountInfo.amount, 
        gojekFee: gojekFee, 
        cart: cart, 
        customer: document.getElementById('cartCustomer').value || 'Umum', 
        meja: document.getElementById('cartMeja').value || '-', 
        noNota: noNota, 
        status: 'Aktif', 
        discountInfo: discountInfo 
    };
    
    if (metode === 'MIX') { 
        payload.mixCash = mixCash; 
        payload.mixTf = mixTf; 
    }

    try {
        await addDoc(getColRef('transactions'), payload); 
        let itemsTerjual = {}; 
        cart.forEach(c => { itemsTerjual[c.nama.toLowerCase()] = (itemsTerjual[c.nama.toLowerCase()] || 0) + c.qty; });
        
        for (let stok of stocksDB) { 
            if (!stok.menuTerkait) continue; 
            const menusTerkait = stok.menuTerkait.split(',').map(m => m.trim().toLowerCase()); 
            let totalPotong = 0; 
            for (let nama in itemsTerjual) { 
                if (menusTerkait.includes(nama)) totalPotong += itemsTerjual[nama]; 
            } 
            if (totalPotong > 0) { 
                await setDoc(getDocRef('stocks', stok.id), { stokSaatIni: formatDec((parseFloat(stok.stokSaatIni)||0) - totalPotong) }, { merge: true }); 
            } 
        }
        
        hideLoading(); 
        showToast('Transaksi Berhasil!'); 
        window.lastPrintedPayload = payload; 
        cetakStrukPreview(payload); 
        window.clearCart();
    } catch (err) { 
        console.error(err); 
        hideLoading(); 
        showToast('Gagal memproses.', 'error'); 
    }
};

// EDIT NOTA MANAGER
let editingTrxId = null; 
let originalTrxData = null;

window.editNotaManager = (id) => {
    const trx = transactionsDB.find(t => t.id === id); 
    if (!trx) return;
    
    editingTrxId = id; 
    originalTrxData = JSON.parse(JSON.stringify(trx)); 
    cart = JSON.parse(JSON.stringify(trx.cart)); 
    tipeOrder = trx.tipeOrder; 
    discountInfo = trx.discountInfo || { type: 'Rp', value: trx.diskonRp || 0, amount: trx.diskonRp || 0 };
    
    document.getElementById('cartCustomer').value = trx.customer; 
    document.getElementById('cartMeja').value = trx.meja; 
    document.getElementById('editMetodeBayar').value = trx.pembayaran || 'CASH'; 
    
    setTipeOrder(tipeOrder); 
    renderCart(); 
    document.getElementById('titleKeranjang').innerText = "EDIT NOTA #" + trx.noNota;
    
    document.getElementById('bayarNormalDiv').classList.add('hidden'); 
    document.getElementById('bayarEditDiv').classList.remove('hidden'); 
    document.getElementById('view-laporan').classList.add('hidden'); 
    document.getElementById('view-kasir').classList.remove('hidden'); 
    showToast("Mode Edit Nota Aktif", "info");
};

window.batalEditNota = () => { 
    editingTrxId = null; 
    originalTrxData = null; 
    document.getElementById('titleKeranjang').innerText = "Pesanan"; 
    clearCart(); 
    document.getElementById('bayarNormalDiv').classList.remove('hidden'); 
    document.getElementById('bayarEditDiv').classList.add('hidden'); 
    document.getElementById('view-kasir').classList.add('hidden'); 
    document.getElementById('view-laporan').classList.remove('hidden'); 
};

window.simpanEditNota = async () => {
    if (!editingTrxId) return; 
    showLoading("Menyimpan Perubahan...");
    
    let totalAfterDisc = subtotalCart - discountInfo.amount; 
    let finalNetTotal = totalAfterDisc; 
    let gojekFee = 0; 
    
    if(tipeOrder === 'Gojek') { 
        const g = getGojekFee(totalAfterDisc); 
        finalNetTotal = g.finalTotal; 
        gojekFee = g.fee; 
    }
    
    const payload = { 
        total: finalNetTotal, 
        totalBayar: totalAfterDisc, 
        subtotal: subtotalCart, 
        diskonRp: discountInfo.amount, 
        gojekFee: gojekFee, 
        cart: cart, 
        customer: document.getElementById('cartCustomer').value || 'Umum', 
        meja: document.getElementById('cartMeja').value || '-', 
        tipeOrder: tipeOrder, 
        discountInfo: discountInfo, 
        pembayaran: document.getElementById('editMetodeBayar').value 
    };
    
    try {
        let oldItems = {}; 
        originalTrxData.cart.forEach(c => oldItems[c.nama.toLowerCase()] = (oldItems[c.nama.toLowerCase()] || 0) + c.qty); 
        let newItems = {}; 
        cart.forEach(c => newItems[c.nama.toLowerCase()] = (newItems[c.nama.toLowerCase()] || 0) + c.qty);
        
        for (let stok of stocksDB) { 
            if (!stok.menuTerkait) continue; 
            const menusTerkait = stok.menuTerkait.split(',').map(m => m.trim().toLowerCase()); 
            let qtyDikembalikan = 0; 
            let qtyDiambil = 0; 
            
            menusTerkait.forEach(m => { 
                if (oldItems[m]) qtyDikembalikan += oldItems[m]; 
                if (newItems[m]) qtyDiambil += newItems[m]; 
            }); 
            
            let selisih = qtyDiambil - qtyDikembalikan; 
            if (selisih !== 0) { 
                let currentStock = parseFloat(stok.stokSaatIni) || 0; 
                await setDoc(getDocRef('stocks', stok.id), { stokSaatIni: formatDec(currentStock - selisih) }, { merge: true }); 
            } 
        }
        
        await setDoc(getDocRef('transactions', editingTrxId), payload, { merge: true }); 
        hideLoading(); 
        showToast("Nota Berhasil Diupdate!", "success"); 
        window.batalEditNota();
    } catch (err) { 
        console.error(err); 
        hideLoading(); 
        showToast("Gagal update nota", "error"); 
    }
};

// LAPORAN TRANSAKSI
window.renderLaporanUI = () => {
    const filterTgl = document.getElementById('filterTglLaporan').value; 
    const filterTipe = document.getElementById('filterTipeLaporan') ? document.getElementById('filterTipeLaporan').value : 'ALL'; 
    const filterMetode = document.getElementById('filterMetodeLaporan') ? document.getElementById('filterMetodeLaporan').value : 'ALL';
    
    if(!filterTgl) return; 
    
    let totCash = 0, totTF = 0, countNota = 0; 
    const tbl = document.getElementById('tblLaporanTrx'); 
    tbl.innerHTML = '';
    
    let angsulanAwal = 0; 
    let repKemarinId = null; 
    const d = new Date(filterTgl); 
    d.setDate(d.getDate() - 1); 
    const yesterdayStr = d.toISOString().split('T')[0]; 
    const repKemarin = closeRegistersDB.find(c => c.tanggal === yesterdayStr); 
    
    if(repKemarin) { 
        angsulanAwal = repKemarin.angsulanDitinggal || 0; 
        repKemarinId = repKemarin.id; 
    }
    
    if (currentUser && currentUser.role === 'admin') { 
        document.getElementById('totLaporanAngsulanText').classList.add('hidden'); 
        document.getElementById('inputAngsulanLaporan').classList.remove('hidden'); 
        document.getElementById('inputAngsulanLaporan').value = angsulanAwal ? angsulanAwal.toLocaleString('id-ID') : ''; 
        document.getElementById('inputAngsulanLaporan').dataset.repid = repKemarinId || ''; 
        document.getElementById('inputAngsulanLaporan').dataset.yesterday = yesterdayStr; 
    } else { 
        document.getElementById('totLaporanAngsulanText').classList.remove('hidden'); 
        document.getElementById('inputAngsulanLaporan').classList.add('hidden'); 
        document.getElementById('totLaporanAngsulanText').innerText = formatIDR(angsulanAwal); 
    }

    let filteredTrx = transactionsDB.filter(t => t.tanggal === filterTgl && t.status === 'Aktif');
    
    if(filterTipe !== 'ALL') filteredTrx = filteredTrx.filter(t => t.tipeOrder === filterTipe); 
    if(filterMetode !== 'ALL') filteredTrx = filteredTrx.filter(t => t.pembayaran === filterMetode || (filterMetode === 'MIX' && t.pembayaran === 'MIX'));

    filteredTrx.sort((a,b) => b.timestamp - a.timestamp).forEach(item => {
        countNota++; 
        if (item.pembayaran === 'CASH') totCash += item.total; 
        else if (item.pembayaran === 'TRANSFER') totTF += item.total; 
        else if (item.pembayaran === 'MIX') { 
            totCash += (item.mixCash || 0); 
            totTF += (item.mixTf || 0); 
        }
        
        let btnEdit = ''; 
        if (currentUser && ['admin','kasir'].includes(currentUser.role)) { 
            btnEdit = `<button onclick="editNotaManager('${item.id}')" title="Edit Nota" class="w-8 h-8 text-blue-500 hover:text-white hover:bg-blue-500 rounded-xl transition shadow-sm border border-blue-100 mr-1"><i class="fas fa-edit text-[10px]"></i></button>`; 
        }
        
        let gojekTag = item.gojekFee > 0 ? `<br><span class="text-[9px] text-rose-500 bg-rose-50 px-1 rounded inline-block mt-0.5 border border-rose-100">Pot. App: -${formatIDRPlain(item.gojekFee)}</span>` : ''; 
        let payBadgeColor = item.pembayaran === 'CASH' ? 'bg-emerald-100 text-emerald-700' : (item.pembayaran === 'MIX' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700');
        
        tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-4 pl-5 font-black text-slate-800">#${item.noNota}</td><td class="p-4 text-slate-500 font-bold">${item.waktu.substring(11, 16)}</td><td class="p-4 font-black">${item.customer} <span class="text-[9px] text-slate-400 uppercase">(${item.meja})</span></td><td class="p-4 text-xs font-bold text-slate-600">${item.kasir.split(' ')[0]}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded-md text-[9px] font-black tracking-widest ${payBadgeColor}">${item.pembayaran}</span><span class="block mt-1 text-[9px] text-slate-400 font-bold uppercase tracking-widest">${item.tipeOrder}</span></td><td class="p-4 text-right font-black tracking-tight text-slate-800">${formatIDR(item.total)}${gojekTag}</td><td class="p-4 text-center whitespace-nowrap"><button onclick="window.lastPrintedPayload = transactionsDB.find(t=>t.id==='${item.id}'); cetakStrukPreview(window.lastPrintedPayload);" title="Print Ulang" class="w-8 h-8 text-emerald-500 hover:text-white hover:bg-emerald-500 rounded-xl transition shadow-sm border border-emerald-100 mr-1"><i class="fas fa-print text-[10px]"></i></button>${btnEdit}<button onclick="hapusNota('${item.id}')" class="w-8 h-8 text-rose-400 hover:text-white hover:bg-rose-500 rounded-xl transition shadow-sm border border-rose-100"><i class="fas fa-trash-alt text-[10px]"></i></button></td></tr>`;
    });
    
    document.getElementById('totLaporanCash').innerText = formatIDR(totCash); 
    document.getElementById('totLaporanTF').innerText = formatIDR(totTF); 
    document.getElementById('totLaporanOmset').innerText = formatIDR(totCash + totTF);
};

window.hapusNota = (id) => { 
    window.showModal("Batalkan Transaksi", "Nota akan dibatalkan, stok dikembalikan, dan nota dipindah ke Tong Sampah. Lanjutkan?", async () => { 
        if(!auth.currentUser) return; 
        showLoading("Membatalkan..."); 
        try { 
            const trx = transactionsDB.find(t => t.id === id); 
            if(trx && trx.status === 'Aktif') { 
                let itemsDikembalikan = {}; 
                trx.cart.forEach(c => { itemsDikembalikan[c.nama.toLowerCase()] = (itemsDikembalikan[c.nama.toLowerCase()] || 0) + c.qty; }); 
                
                for (let stok of stocksDB) { 
                    if (!stok.menuTerkait) continue; 
                    const menusTerkait = stok.menuTerkait.split(',').map(m => m.trim().toLowerCase()); 
                    let totalKembali = 0; 
                    for (let nama in itemsDikembalikan) { 
                        if (menusTerkait.includes(nama)) totalKembali += itemsDikembalikan[nama]; 
                    } 
                    if (totalKembali > 0) { 
                        let currentStock = parseFloat(stok.stokSaatIni) || 0; 
                        await setDoc(getDocRef('stocks', stok.id), { stokSaatIni: formatDec(currentStock + totalKembali) }, { merge: true }); 
                    } 
                } 
                // Simpan ke tong sampah, lalu hapus dari laporan utama
                await addDoc(getColRef('trashed_bills'), { ...trx, status: 'Batal/Void', deleteTimestamp: Date.now(), originalSource: 'transactions' });
                await deleteDoc(getDocRef('transactions', id));
            } 
            hideLoading(); 
            showToast("Nota Dibatalkan & Pindah ke Tong Sampah!", "success"); 
        } catch(err) { 
            console.error(err); 
            hideLoading(); 
            showToast("Gagal membatalkan", "error"); 
        } 
    }); 
};

window.updateAngsulanAwalLaporan = async (val) => { 
    if(currentUser.role !== 'admin') return; 
    const el = document.getElementById('inputAngsulanLaporan'); 
    const repId = el.dataset.repid; 
    const yesterdayStr = el.dataset.yesterday; 
    const newVal = getCleanNumber(val); 
    
    showLoading("Update Angsulan..."); 
    try { 
        if (repId) { 
            await setDoc(getDocRef('close_registers', repId), { angsulanDitinggal: newVal }, { merge: true }); 
        } else { 
            await addDoc(getColRef('close_registers'), { tanggal: yesterdayStr, angsulanDitinggal: newVal, timestamp: Date.now(), kasir: 'Manager Update' }); 
        } 
        showToast("Angsulan Laci Diperbarui"); 
    } catch (e) { 
        console.error(e); showToast("Gagal update angsulan", "error"); 
    } 
    hideLoading(); 
};

// PENGELUARAN
window.renderPengeluaranUI = () => { 
    let totOut = 0; 
    const tbl = document.getElementById('tblPengeluaran'); 
    tbl.innerHTML = ''; 
    
    expensesDB.filter(e => e.tanggal === getTodayYMD()).sort((a,b) => b.timestamp - a.timestamp).forEach(o => { 
        totOut += o.nominal; 
        tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-4 pl-5 text-slate-500 font-bold">${o.waktu.substring(11,16)}</td><td class="p-4 font-black text-slate-800">${o.deskripsi}</td><td class="p-4 text-right font-black text-rose-600 tracking-tight">${formatIDR(o.nominal)}</td><td class="p-4 text-center"><button onclick="hapusPengeluaran('${o.id}')" class="text-rose-400 hover:text-rose-600"><i class="fas fa-times"></i></button></td></tr>`; 
    }); 
    document.getElementById('totOutHarian').innerText = "Total: " + formatIDR(totOut); 
};

window.simpanPengeluaran = async () => { 
    if(!auth.currentUser) return; 
    const deskripsi = document.getElementById('outDeskripsi').value; 
    const nominal = getCleanNumber(document.getElementById('outNominal').value); 
    
    if (!deskripsi || nominal <= 0) return showToast('Isi form dengan benar!', 'error'); 
    
    await addDoc(getColRef('expenses'), { 
        waktu: getTimestampStr(), 
        tanggal: getTodayYMD(), 
        timestamp: Date.now(), 
        kasir: currentUser.nama, 
        deskripsi: deskripsi, 
        nominal: nominal 
    }); 
    
    document.getElementById('outDeskripsi').value = ''; 
    document.getElementById('outNominal').value = ''; 
    showToast("Pengeluaran dicatat."); 
};

window.hapusPengeluaran = async (id) => { 
    if(!auth.currentUser) return; 
    await deleteDoc(getDocRef('expenses', id)); 
};

// TUTUP BUKU
let tbGlobal = { cash: 0, tf: 0, out: 0, angsulanAwal: 0 };

window.renderTutupBukuUI = () => {
    if(currentUser && currentUser.role === 'admin') {
        document.getElementById('tb-kasir-view').classList.add('hidden'); 
        document.getElementById('tb-manager-view').classList.remove('hidden');
        
        if(!document.getElementById('filterTbManager').value) { 
            const d = new Date(); 
            document.getElementById('filterTbManager').value = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`; 
        } 
        window.renderManagerTutupBuku();
    } else {
        document.getElementById('tb-manager-view').classList.add('hidden'); 
        document.getElementById('tb-kasir-view').classList.remove('hidden');
        
        let dateInput = document.getElementById('tbInputTanggal'); 
        if(!dateInput.value) dateInput.value = getTodayYMD(); 
        const selectedDate = dateInput.value;
        
        tbGlobal.cash = 0; 
        tbGlobal.tf = 0; 
        tbGlobal.out = 0;
        
        transactionsDB.filter(t => t.tanggal === selectedDate && t.status === 'Aktif').forEach(t => { 
            if(t.pembayaran === 'CASH') tbGlobal.cash += t.total; 
            else if(t.pembayaran === 'TRANSFER') tbGlobal.tf += t.total; 
            else if(t.pembayaran === 'MIX') { tbGlobal.cash += (t.mixCash || 0); tbGlobal.tf += (t.mixTf || 0); } 
        });
        
        expensesDB.filter(e => e.tanggal === selectedDate).forEach(e => { tbGlobal.out += e.nominal; });
        
        tbGlobal.angsulanAwal = 0; 
        const d = new Date(selectedDate); d.setDate(d.getDate() - 1); 
        const yesterdayStr = d.toISOString().split('T')[0]; 
        const repKemarin = closeRegistersDB.find(c => c.tanggal === yesterdayStr); 
        
        if(repKemarin) tbGlobal.angsulanAwal = repKemarin.angsulanDitinggal || 0;
        
        document.getElementById('tbAngsulanAwalText').innerText = formatIDR(tbGlobal.angsulanAwal); 
        document.getElementById('tbTotalCash').innerText = "+ " + formatIDR(tbGlobal.cash); 
        document.getElementById('tbTotalTF').innerText = "+ " + formatIDR(tbGlobal.tf); 
        document.getElementById('tbTotalOut').innerText = "- " + formatIDR(tbGlobal.out); 
        window.hitungSetoran();

        const existing = closeRegistersDB.find(c => c.tanggal === selectedDate && c.kasir === currentUser.nama); 
        const btnSubmit = document.getElementById('btnSubmitTb'); 
        const alertLock = document.getElementById('tbLockAlert');
        
        if (existing) { 
            if (!existing.isUnlocked) { 
                btnSubmit.classList.add('hidden'); 
                alertLock.classList.remove('hidden'); 
                alertLock.innerHTML = '<i class="fas fa-lock mr-2"></i> Laporan hari ini sudah disubmit & dikunci.'; 
                alertLock.className = 'bg-slate-100 text-slate-500 font-bold text-xs p-3 rounded-xl text-center mb-4 border border-slate-200'; 
            } else { 
                btnSubmit.classList.remove('hidden'); 
                alertLock.classList.remove('hidden'); 
                btnSubmit.innerHTML = '<i class="fas fa-edit"></i><span>Kunci & Submit Revisi</span>'; 
                btnSubmit.className = 'w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm uppercase tracking-widest rounded-xl shadow-xl transition transform hover:-translate-y-1 relative z-10 flex items-center justify-center space-x-2'; 
                alertLock.innerHTML = '<i class="fas fa-unlock mr-2"></i> Mode Revisi Aktif. Silakan update angka fisik.'; 
                alertLock.className = 'bg-blue-50 text-blue-600 font-bold text-xs p-3 rounded-xl text-center mb-4 border border-blue-200'; 
            } 
        } else { 
            btnSubmit.classList.remove('hidden'); 
            alertLock.classList.add('hidden'); 
            btnSubmit.innerHTML = '<i class="fas fa-paper-plane"></i><span>Submit Tutup Buku</span>'; 
            btnSubmit.className = 'w-full py-4 bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-sm uppercase tracking-widest rounded-xl shadow-xl transition transform hover:-translate-y-1 relative z-10 flex items-center justify-center space-x-2'; 
        }
    }
};

window.renderManagerTutupBuku = () => {
    const bln = document.getElementById('filterTbManager').value; 
    const container = document.getElementById('tbManagerList'); 
    container.innerHTML = ''; 
    if(!bln) return;
    
    const btnContainer = document.createElement('div');
    btnContainer.className = 'col-span-full mb-2 flex justify-end';
    btnContainer.innerHTML = `<button onclick="document.getElementById('modalExcelTb').classList.remove('hidden')" class="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition flex items-center space-x-2"><i class="fas fa-file-excel text-lg"></i><span>Download Excel Profesional</span></button>`;
    container.appendChild(btnContainer);

    const data = closeRegistersDB.filter(c => c.tanggal.startsWith(bln)).sort((a,b) => b.timestamp - a.timestamp);
    
    if(data.length === 0) { 
        container.innerHTML += `<div class="col-span-full p-8 text-center text-slate-400 font-bold bg-white border border-slate-200 border-dashed rounded-3xl mt-2"><i class="fas fa-folder-open text-3xl mb-2 opacity-50 block"></i>Belum ada data Tutup Buku di bulan ini.</div>`; 
        return; 
    }
    
    data.forEach(d => { 
        let lockBadge = d.isUnlocked ? `<div class="mt-3 text-[10px] text-amber-600 font-bold bg-amber-50 p-1.5 rounded text-center border border-amber-200"><i class="fas fa-unlock"></i> Kasir Sedang Revisi</div>` : `<div class="mt-3 text-[10px] text-emerald-600 font-bold bg-emerald-50 p-1.5 rounded text-center border border-emerald-200"><i class="fas fa-lock"></i> Terkunci (Selesai)</div>`; 
        container.innerHTML += `<div onclick="bukaDetailTbManager('${d.id}')" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition group mt-2"><div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span class="font-black text-slate-800 text-lg group-hover:text-amber-600 transition"><i class="fas fa-calendar-check mr-1 text-slate-300"></i> ${d.tanggal.split('-').reverse().join('/')}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-bold uppercase">${d.kasir}</span></div><div class="flex justify-between items-center"><span class="text-xs text-slate-500 font-bold">Setoran Fisik:</span><span class="font-black text-amber-600">${formatIDR(d.setoranCashReal)}</span></div><div class="flex justify-between items-center mt-1"><span class="text-[10px] text-slate-500 font-bold">Status:</span><span class="font-black text-xs">${d.selisihSetoran === 0 ? '<span class="text-emerald-500">KLOP</span>' : (d.selisihSetoran > 0 ? `<span class="text-blue-500">+${formatIDR(d.selisihSetoran)}</span>` : `<span class="text-rose-500">-${formatIDR(Math.abs(d.selisihSetoran))}</span>`)}</span></div>${lockBadge}</div>`; 
    });
};

window.bukaDetailTbManager = (id) => {
    const tb = closeRegistersDB.find(c => c.id === id); 
    if(!tb) return;
    
    document.getElementById('detailTbTgl').innerText = tb.tanggal; 
    document.getElementById('detailTbKasir').innerText = tb.kasir; 
    document.getElementById('detailTbAwal').innerText = formatIDR(tb.angsulanAwal); 
    document.getElementById('detailTbOut').innerText = formatIDR(tb.pengeluaran); 
    document.getElementById('detailTbCash').innerText = formatIDR(tb.penjualanCash); 
    document.getElementById('detailTbTf').innerText = formatIDR(tb.penjualanTf); 
    document.getElementById('detailTbAngsulan').innerText = formatIDR(tb.angsulanDitinggal); 
    document.getElementById('detailTbSetoran').innerText = formatIDR(tb.setoranCashReal);
    
    let elSelisih = document.getElementById('detailTbSelisih'); 
    elSelisih.innerText = tb.selisihSetoran === 0 ? 'PAS (KLOP)' : (tb.selisihSetoran > 0 ? `+ ${formatIDR(tb.selisihSetoran)}` : `- ${formatIDR(Math.abs(tb.selisihSetoran))}`); 
    elSelisih.className = `font-black ${tb.selisihSetoran === 0 ? 'text-emerald-600' : (tb.selisihSetoran > 0 ? 'text-blue-600' : 'text-rose-600')}`;
    
    document.getElementById('btnUnlockTb').onclick = () => bukaKunciTbManager(id); 
    document.getElementById('btnEditTbFull').onclick = () => { document.getElementById('modalDetailTbManager').classList.add('hidden'); bukaModalEditTbManager(id); };
    
    if(tb.isUnlocked) document.getElementById('btnUnlockTb').classList.add('hidden'); 
    else document.getElementById('btnUnlockTb').classList.remove('hidden'); 
    
    document.getElementById('modalDetailTbManager').classList.remove('hidden');
};

window.bukaKunciTbManager = async (id) => { 
    showLoading("Membuka Kunci..."); 
    try { 
        await setDoc(getDocRef('close_registers', id), { isUnlocked: true }, { merge: true }); 
        hideLoading(); 
        document.getElementById('modalDetailTbManager').classList.add('hidden'); 
        showToast("Akses revisi diberikan ke Kasir!", "success"); 
        renderManagerTutupBuku(); 
    } catch (err) { 
        console.error(err); hideLoading(); showToast("Gagal membuka kunci", "error"); 
    } 
};

window.bukaModalEditTbManager = (id) => { 
    const tb = closeRegistersDB.find(c => c.id === id); 
    if(!tb) return; 
    
    document.getElementById('editTbDocId').value = tb.id; 
    document.getElementById('editTbAngsulanAwal').value = tb.angsulanAwal ? tb.angsulanAwal.toLocaleString('id-ID') : 0; 
    document.getElementById('editTbCash').value = tb.penjualanCash ? tb.penjualanCash.toLocaleString('id-ID') : 0; 
    document.getElementById('editTbTf').value = tb.penjualanTf ? tb.penjualanTf.toLocaleString('id-ID') : 0; 
    document.getElementById('editTbOut').value = tb.pengeluaran ? tb.pengeluaran.toLocaleString('id-ID') : 0; 
    document.getElementById('editTbSetoran').value = tb.setoranCashReal ? tb.setoranCashReal.toLocaleString('id-ID') : 0; 
    document.getElementById('editTbAngsulan').value = tb.angsulanDitinggal ? tb.angsulanDitinggal.toLocaleString('id-ID') : 0; 
    document.getElementById('modalEditTbManager').classList.remove('hidden'); 
};

window.simpanEditTbManager = async () => {
    const id = document.getElementById('editTbDocId').value; 
    const aAwal = getCleanNumber(document.getElementById('editTbAngsulanAwal').value); 
    const pCash = getCleanNumber(document.getElementById('editTbCash').value); 
    const pTf = getCleanNumber(document.getElementById('editTbTf').value); 
    const pOut = getCleanNumber(document.getElementById('editTbOut').value); 
    const setoran = getCleanNumber(document.getElementById('editTbSetoran').value); 
    const angsulan = getCleanNumber(document.getElementById('editTbAngsulan').value);
    
    if(!id) return; 
    showLoading("Menyimpan..."); 
    try { 
        const setoranSistem = (aAwal + pCash + pTf) - pOut - angsulan; 
        const selisih = setoran - Math.max(0, setoranSistem); 
        const payload = { 
            angsulanAwal: aAwal, penjualanCash: pCash, penjualanTf: pTf, pengeluaran: pOut, 
            setoranCashReal: setoran, angsulanDitinggal: angsulan, selisihSetoran: selisih, 
            totalOmsetKotor: pCash + pTf, isEdited: true, editedAt: getTimestampStr() 
        }; 
        
        await setDoc(getDocRef('close_registers', id), payload, { merge: true }); 
        document.getElementById('modalEditTbManager').classList.add('hidden'); 
        showToast("Tutup Buku diperbarui"); 
        window.renderManagerTutupBuku(); 
    } catch (err) { 
        console.error(err); showToast("Gagal update", "error"); 
    } 
    hideLoading();
};

window.hitungSetoran = () => { 
    const angsulanBesok = getCleanNumber(document.getElementById('tbInputAngsulan').value); 
    const setoranSistem = tbGlobal.angsulanAwal + tbGlobal.cash + tbGlobal.tf - tbGlobal.out - angsulanBesok; 
    const fisikStr = document.getElementById('tbInputFisik').value; 
    const fisikReal = getCleanNumber(fisikStr); 
    
    document.getElementById('tbSetoranCash').innerText = formatIDR(Math.max(0, setoranSistem)); 
    const elSelisih = document.getElementById('tbSelisihSetoran'); 
    
    if(fisikStr === '') { 
        elSelisih.innerText = "Rp 0"; elSelisih.className = "text-xl font-black text-slate-800"; 
    } else { 
        const selisih = fisikReal - Math.max(0, setoranSistem); 
        if (selisih === 0) { elSelisih.innerText = "PAS (KLOP)"; elSelisih.className = "text-xl font-black text-emerald-600"; } 
        else if (selisih > 0) { elSelisih.innerText = "+ " + formatIDR(selisih) + " (LEBIH)"; elSelisih.className = "text-xl font-black text-blue-600"; } 
        else { elSelisih.innerText = "- " + formatIDR(Math.abs(selisih)) + " (MINUS)"; elSelisih.className = "text-xl font-black text-rose-600"; } 
    } 
};

window.simpanTutupBuku = () => {
    if(!auth.currentUser) return; 
    const selectedDate = document.getElementById('tbInputTanggal').value; 
    const existing = closeRegistersDB.find(c => c.tanggal === selectedDate && c.kasir === currentUser.nama); 
    
    if (existing && !existing.isUnlocked) return showToast("Sudah Tutup Buku!", "error"); 
    const fisikStr = document.getElementById('tbInputFisik').value; 
    if(fisikStr === '') return showToast("MOHON ISI UANG CASH REAL!", "error");
    
    window.showModal("Konfirmasi Tutup Buku", "Pastikan hitungan fisik uang cash Anda sudah sesuai dengan sistem.", async () => { 
        showLoading("Menyimpan..."); 
        const angsulanBesok = getCleanNumber(document.getElementById('tbInputAngsulan').value); 
        const setoranSistem = tbGlobal.angsulanAwal + tbGlobal.cash + tbGlobal.tf - tbGlobal.out - angsulanBesok; 
        const fisikReal = getCleanNumber(fisikStr); 
        const selisih = fisikReal - Math.max(0, setoranSistem); 
        
        const payload = { 
            tanggal: selectedDate, waktu: getTimestampStr(), timestamp: Date.now(), 
            kasir: currentUser.nama, penjualanCash: tbGlobal.cash, penjualanTf: tbGlobal.tf, 
            pengeluaran: tbGlobal.out, angsulanAwal: tbGlobal.angsulanAwal, 
            angsulanDitinggal: angsulanBesok, setoranCashReal: fisikReal, 
            selisihSetoran: selisih, totalOmsetKotor: tbGlobal.cash + tbGlobal.tf, isUnlocked: false 
        }; 
        
        if (existing && existing.isUnlocked) await setDoc(getDocRef('close_registers', existing.id), payload, {merge: true}); 
        else await addDoc(getColRef('close_registers'), payload); 
        
        hideLoading(); showToast("Tutup Buku Tersimpan!", "success"); 
        window.renderTutupBukuUI(); 
    });
};

// EXPORT EXCEL TUTUP BUKU PROFESIONAL
window.exportExcelTutupBuku = async () => {
    if (typeof ExcelJS === 'undefined') {
        return showToast("Alat pembuat Excel belum siap.", "error");
    }

    const bln = document.getElementById('filterTbManager').value;
    if(!bln) return showToast("Pilih bulan terlebih dahulu!", "error");

    const data = closeRegistersDB.filter(c => c.tanggal.startsWith(bln)).sort((a,b) => a.tanggal.localeCompare(b.tanggal));
    if(data.length === 0) return showToast("Tidak ada data di bulan ini.", "error");

    showLoading("Membuat Laporan Excel...");
    
    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Laporan Tutup Buku');
        
        // Atur Lebar Kolom
        ws.columns = [
            { header: '', key: 'tgl', width: 15 },
            { header: '', key: 'kasir', width: 18 },
            { header: '', key: 'awal', width: 18 },
            { header: '', key: 'out', width: 18 },
            { header: '', key: 'cash', width: 18 },
            { header: '', key: 'tf', width: 18 },
            { header: '', key: 'ditinggal', width: 18 },
            { header: '', key: 'fisik', width: 20 },
            { header: '', key: 'selisih', width: 22 }
        ];

        // Styling Judul
        ws.mergeCells('A1:I1');
        const titleRow = ws.getCell('A1');
        titleRow.value = 'LAPORAN TUTUP BUKU - PAWON NUSANTARA';
        titleRow.font = { size: 16, bold: true };
        titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }; // Gold

        ws.mergeCells('A2:I2');
        ws.getCell('A2').value = `Periode Bulan: ${bln}`;
        ws.getCell('A2').font = { bold: true };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ws.mergeCells('A3:I3');
        const d = new Date();
        ws.getCell('A3').value = `Dicetak pada: ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}`;
        ws.getCell('A3').font = { italic: true };
        ws.getCell('A3').alignment = { horizontal: 'center' };

        // Header Tabel
        const headers = ['Tanggal', 'Nama Kasir', 'Angsulan Awal', 'Pengeluaran', 'Total Cash', 'Total TF', 'Angsulan Ditinggal', 'Setoran Fisik Real', 'Status Selisih'];
        ws.addRow(headers);
        const headerRow = ws.getRow(5);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        
        for(let i = 1; i <= 9; i++) {
            ws.getCell(5, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
        }

        // Variabel Total
        let sumAwal = 0, sumOut = 0, sumCash = 0, sumTf = 0, sumDitinggal = 0, sumFisik = 0, sumSelisih = 0;

        // Iterasi Data
        data.forEach(item => {
            sumAwal += item.angsulanAwal || 0;
            sumOut += item.pengeluaran || 0;
            sumCash += item.penjualanCash || 0;
            sumTf += item.penjualanTf || 0;
            sumDitinggal += item.angsulanDitinggal || 0;
            sumFisik += item.setoranCashReal || 0;
            sumSelisih += item.selisihSetoran || 0;

            let selisihTeks = item.selisihSetoran === 0 ? 'KLOP (Rp 0)' : (item.selisihSetoran > 0 ? `+ Rp ${item.selisihSetoran.toLocaleString('id-ID')}` : `- Rp ${Math.abs(item.selisihSetoran).toLocaleString('id-ID')}`);
            
            const row = ws.addRow([
                item.tanggal.split('-').reverse().join('/'),
                item.kasir,
                item.angsulanAwal,
                item.pengeluaran,
                item.penjualanCash,
                item.penjualanTf,
                item.angsulanDitinggal,
                item.setoranCashReal,
                selisihTeks
            ]);

            // Format Angka Rupiah
            for(let i = 3; i <= 8; i++) { 
                row.getCell(i).numFmt = '"Rp" #,##0'; 
            }
            
            // Warnai kolom selisih
            const sel = row.getCell(9);
            sel.font = { bold: true };
            if (item.selisihSetoran < 0) sel.font.color = { argb: 'FFFF0000' };
            else if (item.selisihSetoran > 0) sel.font.color = { argb: 'FF0000FF' };
            else sel.font.color = { argb: 'FF008000' };
        });

        // Baris Total Bawah
        const totalRow = ws.addRow([ 
            'TOTAL AKUMULASI', 
            '', 
            sumAwal, sumOut, sumCash, sumTf, sumDitinggal, sumFisik, 
            sumSelisih < 0 ? `- Rp ${Math.abs(sumSelisih).toLocaleString('id-ID')}` : `+ Rp ${sumSelisih.toLocaleString('id-ID')}` 
        ]);
        
        totalRow.font = { bold: true };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } };
        for(let i = 3; i <= 8; i++) { 
            totalRow.getCell(i).numFmt = '"Rp" #,##0'; 
        }

        // Freeze Panes (Kunci kepala tabel saat scroll)
        ws.views = [{ state: 'frozen', ySplit: 5 }];

        // Generate File & Trigger Download
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_Tutup_Buku_${bln}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        hideLoading();
        showToast("Excel berhasil diunduh!", "success");
    } catch (e) {
        console.error(e);
        hideLoading();
        showToast("Gagal membuat Excel", "error");
    }
};

// MANAJEMEN MENU
window.renderKelolaMenu = () => { 
    const tbl = document.getElementById('tblKelolaMenu'); tbl.innerHTML = ''; 
    let categories = [...new Set(menusDB.map(m => m.kategori.toUpperCase()))]; 
    const defaultCats = ['MAKANAN', 'MINUMAN', 'TAMBAHAN']; 
    categories = [...new Set([...defaultCats, ...categories])]; 
    
    const dl = document.getElementById('listKategori'); 
    if(dl) { dl.innerHTML = ''; categories.forEach(c => dl.innerHTML += `<option value="${c}"></option>`); } 
    
    categories.forEach(cat => { 
        const items = menusDB.filter(m => m.kategori.toUpperCase() === cat).sort((a,b) => (parseInt(a.urutan)||999) - (parseInt(b.urutan)||999)); 
        if (items.length > 0) { 
            tbl.innerHTML += `<tr><td colspan="5" class="p-3 pl-5 bg-slate-50 font-black text-slate-600 text-[10px] uppercase tracking-widest border-y border-slate-100"><i class="fas fa-tag text-amber-500 mr-2"></i>KATEGORI: ${cat}</td></tr>`; 
            items.forEach(m => { tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-4 pl-5 font-black text-slate-800">${m.nama}</td><td class="p-4 text-center font-bold text-slate-500">${m.urutan || 999}</td><td class="p-4 text-right font-black text-slate-700 tracking-tight">${formatIDR(m.hargaDineIn)}</td><td class="p-4 text-right font-black text-slate-700 tracking-tight">${formatIDR(m.hargaGojek)}</td><td class="p-4 text-center"><button onclick="editMenu('${m.id}')" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition"><i class="fas fa-edit"></i></button><button onclick="hapusMenu('${m.id}')" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"><i class="fas fa-trash-alt"></i></button></td></tr>`; }); 
        } 
    }); 
};

window.openModalMenu = () => { document.getElementById('menuId').value = ''; document.getElementById('menuNama').value = ''; document.getElementById('menuKategori').value = ''; document.getElementById('menuUrutan').value = ''; document.getElementById('menuHargaDineIn').value = ''; document.getElementById('menuHargaGojek').value = ''; document.getElementById('modalMenu').classList.remove('hidden'); };
window.closeModalMenu = () => document.getElementById('modalMenu').classList.add('hidden');
window.simpanMenuData = async () => { if(!auth.currentUser) return; const id = document.getElementById('menuId').value; const payload = { nama: document.getElementById('menuNama').value, kategori: document.getElementById('menuKategori').value.toUpperCase() || 'UMUM', urutan: parseInt(document.getElementById('menuUrutan').value) || 999, hargaDineIn: getCleanNumber(document.getElementById('menuHargaDineIn').value), hargaGojek: getCleanNumber(document.getElementById('menuHargaGojek').value) }; if(!payload.nama) return showToast("Nama wajib!", "error"); if (id) await setDoc(getDocRef('menus', id), payload, { merge: true }); else await addDoc(getColRef('menus'), payload); window.closeModalMenu(); showToast("Tersimpan."); };
window.editMenu = (id) => { const m = menusDB.find(item => item.id === id); if (!m) return; document.getElementById('menuId').value = m.id; document.getElementById('menuNama').value = m.nama; document.getElementById('menuKategori').value = m.kategori; document.getElementById('menuUrutan').value = m.urutan || ''; document.getElementById('menuHargaDineIn').value = m.hargaDineIn ? m.hargaDineIn.toLocaleString('id-ID') : ''; document.getElementById('menuHargaGojek').value = m.hargaGojek ? m.hargaGojek.toLocaleString('id-ID') : ''; document.getElementById('modalMenu').classList.remove('hidden'); };
window.hapusMenu = (id) => { window.showModal("Hapus", "Yakin hapus?", async () => { await deleteDoc(getDocRef('menus', id)); }); };

// MANAJEMEN STOK GUDANG
window.renderKelolaStok = () => { 
    const container = document.getElementById('containerKelolaStok'); 
    container.innerHTML = ''; 
    let userStocks = currentUser.role === 'admin' ? stocksDB : stocksDB.filter(s => s.role === currentUser.role); 
    const roles = [...new Set(userStocks.map(s => s.role))].filter(r => r);
    
    roles.forEach(role => {
        const items = userStocks.filter(s => s.role === role);
        if(items.length > 0) {
            let sectionHTML = `<div class="mb-6"><h4 class="flex items-center text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2"><i class="fas fa-user-tag text-amber-500 mr-2"></i> DIVISI: ${role}</h4><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">`;
            
            items.forEach(s => { 
                const isLow = (parseFloat(s.stokSaatIni)||0) <= (parseFloat(s.stokMinimal)||0); 
                const bgClass = isLow ? 'bg-rose-50 border-rose-400' : 'bg-slate-50 border-slate-200';
                const textClass = isLow ? 'text-rose-600' : 'text-slate-800';
                const alertIcon = isLow ? `<i class="fas fa-exclamation-circle text-rose-500 mb-2 block text-lg animate-pulse" title="Stok Menipis!"></i>` : '';
                
                sectionHTML += `<div class="relative p-4 rounded-2xl border-2 ${bgClass} shadow-sm flex flex-col justify-between group transition hover:shadow-md hover:border-amber-400"><div class="absolute top-2 right-2 flex opacity-100 sm:opacity-0 group-hover:opacity-100 transition"><button onclick="editStok('${s.id}')" class="text-blue-500 bg-blue-100 hover:bg-blue-500 hover:text-white p-1.5 rounded-lg transition mr-1"><i class="fas fa-edit text-[10px]"></i></button><button onclick="hapusStok('${s.id}')" class="text-rose-500 bg-rose-100 hover:bg-rose-500 hover:text-white p-1.5 rounded-lg transition"><i class="fas fa-trash-alt text-[10px]"></i></button></div><div>${alertIcon}<h4 class="font-bold text-xs ${textClass} leading-snug pr-12 line-clamp-2">${s.nama}</h4><p class="text-[9px] text-slate-400 font-bold mt-1 uppercase">Min: ${formatDec(s.stokMinimal)}</p></div><div class="mt-4 flex items-end justify-between border-t ${isLow ? 'border-rose-200' : 'border-slate-200'} pt-2"><span class="text-2xl font-black ${isLow ? 'text-rose-600' : 'text-slate-800'} tracking-tighter">${formatDec(s.stokSaatIni)}</span><span class="text-[9px] text-slate-500 font-bold uppercase mb-1">${s.satuan}</span></div></div>`; 
            });
            sectionHTML += `</div></div>`; 
            container.innerHTML += sectionHTML;
        }
    });
};

window.openModalStok = () => { document.getElementById('stokId').value = ''; document.getElementById('stokNama').value = ''; document.getElementById('stokSatuan').value = ''; document.getElementById('stokMinimal').value = ''; document.getElementById('stokSaatIni').value = ''; document.getElementById('stokSaatIni').disabled = false; document.getElementById('stokRolePIC').value = currentUser.role !== 'admin' ? currentUser.role : 'koki'; document.getElementById('stokRolePIC').disabled = currentUser.role !== 'admin'; const container = document.getElementById('containerCheckMenu'); container.innerHTML = ''; menusDB.forEach(m => { container.innerHTML += `<label class="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-amber-400 transition shadow-sm"><input type="checkbox" value="${m.nama}" class="chk-menu rounded text-amber-500 w-4 h-4"><span class="truncate">${m.nama}</span></label>`; }); document.getElementById('modalStok').classList.remove('hidden'); };
window.closeModalStok = () => document.getElementById('modalStok').classList.add('hidden');
window.simpanStokData = async () => { if(!auth.currentUser) return; const id = document.getElementById('stokId').value; const selectedMenus = Array.from(document.querySelectorAll('.chk-menu:checked')).map(c => c.value).join(', '); const payload = { role: document.getElementById('stokRolePIC').value, nama: document.getElementById('stokNama').value, satuan: document.getElementById('stokSatuan').value, stokMinimal: parseFloat(document.getElementById('stokMinimal').value) || 0, menuTerkait: selectedMenus }; if(!payload.nama) return showToast("Nama wajib!", "error"); if (id) { await setDoc(getDocRef('stocks', id), payload, { merge: true }); } else { payload.stokSaatIni = parseFloat(document.getElementById('stokSaatIni').value) || 0; await addDoc(getColRef('stocks'), payload); } window.closeModalStok(); showToast("Tersimpan."); };
window.editStok = (id) => { const s = stocksDB.find(item => item.id === id); if (!s) return; window.openModalStok(); document.getElementById('stokId').value = s.id; document.getElementById('stokNama').value = s.nama; document.getElementById('stokSatuan').value = s.satuan; document.getElementById('stokMinimal').value = s.stokMinimal; document.getElementById('stokSaatIni').value = s.stokSaatIni; document.getElementById('stokRolePIC').value = s.role || 'koki'; document.getElementById('stokSaatIni').disabled = true; const selected = (s.menuTerkait || '').split(',').map(m => m.trim().toLowerCase()); document.querySelectorAll('.chk-menu').forEach(c => { if (selected.includes(c.value.toLowerCase())) c.checked = true; }); };
window.hapusStok = (id) => { window.showModal("Hapus", "Yakin?", async () => { await deleteDoc(getDocRef('stocks', id)); }); };

// MUTASI STOK
window.loadMutasiDataUI = () => {
    if(currentUser && currentUser.role === 'admin') {
        document.getElementById('mutasi-staff-view').classList.add('hidden'); 
        document.getElementById('mutasi-manager-view').classList.remove('hidden');
        if(!document.getElementById('filterTglMutasiManager').value) { document.getElementById('filterTglMutasiManager').value = getTodayYMD(); } 
        window.renderManagerMutasi();
    } else {
        document.getElementById('mutasi-manager-view').classList.add('hidden'); 
        document.getElementById('mutasi-staff-view').classList.remove('hidden');
        
        const tglFilter = document.getElementById('filterTglMutasi').value; 
        if(!tglFilter) return; 
        
        let targetStocks = stocksDB.filter(s => s.role === currentUser.role); 
        targetStocks.sort((a, b) => a.nama.localeCompare(b.nama));
        
        const mutasiHariIni = mutasiDB.filter(m => m.tanggal === tglFilter && m.role === currentUser.role); 
        const isLocked = mutasiHariIni.length > 0 && !mutasiHariIni.some(m => m.isUnlocked); 
        const sudahRequest = requestsDB.some(r => r.tanggal === tglFilter && r.role === currentUser.role && r.type === 'unlock_mutasi');
        
        if(isLocked) { 
            document.getElementById('btnSubmitMutasi').classList.add('hidden'); 
            document.getElementById('mutasiLockedAlert').classList.remove('hidden'); 
            const btnAjukan = document.getElementById('btnAjukanBuka');
            if(sudahRequest) { btnAjukan.innerText = "Menunggu Persetujuan..."; btnAjukan.disabled = true; btnAjukan.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-400'); btnAjukan.classList.remove('bg-rose-500', 'hover:bg-rose-600'); } 
            else { btnAjukan.innerText = "Ajukan Buka Kunci"; btnAjukan.disabled = false; btnAjukan.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-400'); btnAjukan.classList.add('bg-rose-500', 'hover:bg-rose-600'); }
        } else { 
            document.getElementById('btnSubmitMutasi').classList.remove('hidden'); 
            document.getElementById('mutasiLockedAlert').classList.add('hidden'); 
        }

        let itemTerjualHariIni = {}; 
        transactionsDB.filter(t => t.tanggal === tglFilter && t.status === 'Aktif').forEach(t => { 
            t.cart.forEach(c => { itemTerjualHariIni[c.nama.toLowerCase()] = (itemTerjualHariIni[c.nama.toLowerCase()] || 0) + c.qty; }); 
        });
        
        mutasiDraftHariIni = [];
        targetStocks.forEach(stokItem => {
            let potongKasir = 0; 
            if(stokItem.menuTerkait) { 
                const menus = stokItem.menuTerkait.split(',').map(m => m.trim().toLowerCase()); 
                for(let terjual in itemTerjualHariIni) { if(menus.includes(terjual)) potongKasir += itemTerjualHariIni[terjual]; } 
            }
            
            const draftKey = `${currentUser.role}_${tglFilter}_${stokItem.id}`; 
            const dLocal = window.mutasiDrafts[draftKey] || {};
            let dataTersimpan = mutasiDB.find(m => m.tanggal === tglFilter && m.idStok === stokItem.id); 
            let sisaKemarin = dataTersimpan ? dataTersimpan.sisaKemarin : formatDec((parseFloat(stokItem.stokSaatIni) || 0) + potongKasir);
            
            const masuk = dataTersimpan ? dataTersimpan.masuk : (dLocal.masuk || 0); 
            const manual = dataTersimpan ? dataTersimpan.manual : (dLocal.manual || 0); 
            const rusak = dataTersimpan ? dataTersimpan.rusak : (dLocal.rusak || 0); 
            const seharusnya = formatDec(sisaKemarin + masuk - potongKasir - manual - rusak); 
            const fisik = dataTersimpan ? (dataTersimpan.fisik !== null ? dataTersimpan.fisik : '') : (dLocal.fisik !== undefined ? dLocal.fisik : ''); 
            const selisih = (fisik !== '') ? formatDec(fisik - seharusnya) : 0;
            
            mutasiDraftHariIni.push({ idStok: stokItem.id, nama: stokItem.nama, satuan: stokItem.satuan, docId: dataTersimpan ? dataTersimpan.id : null, sisaKemarin, masuk, potongKasir, manual, rusak, seharusnya, fisik, selisih, isLocked, draftKey });
        });
        window.renderMutasiTable();
    }
};

window.renderMutasiTable = () => {
    const tbl = document.getElementById('tblMutasiStok'); 
    tbl.innerHTML = ''; 
    let adaPerubahan = false;
    
    mutasiDraftHariIni.forEach((m, idx) => {
        let selisihColor = "text-slate-400"; 
        if (m.selisih < 0) selisihColor = "text-rose-600 bg-rose-50"; 
        if (m.selisih > 0) selisihColor = "text-emerald-600 bg-emerald-50"; 
        const dis = m.isLocked ? 'disabled' : ''; 
        const inputClass = `w-full text-center bg-white border border-slate-200 rounded-lg p-2 font-black outline-none transition shadow-sm text-slate-700 ${m.isLocked ? 'opacity-50' : 'focus:ring-2 focus:ring-blue-400'}`;
        if (m.fisik !== '' || m.masuk > 0 || m.manual > 0 || m.rusak > 0) adaPerubahan = true;
        
        tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-2 sm:p-3 pl-3 sm:pl-4 font-black text-slate-800 whitespace-nowrap">${m.nama} <span class="text-[9px] text-slate-400 font-bold uppercase block sm:inline">(${m.satuan})</span></td><td class="p-2 sm:p-3 text-center text-slate-400 font-black bg-slate-50 border-l border-slate-100">${formatDec(m.sisaKemarin)}</td><td class="p-2 sm:p-3 text-center bg-emerald-50/20"><input type="number" step="any" value="${m.masuk||''}" oninput="updateMutasiRow(${idx}, 'masuk', this.value)" class="${inputClass}" ${dis}></td><td class="p-2 sm:p-3 text-center font-black text-rose-500 bg-rose-50/20">${formatDec(m.potongKasir)}</td><td class="p-2 sm:p-3 text-center bg-rose-50/20"><input type="number" step="any" value="${m.manual||''}" oninput="updateMutasiRow(${idx}, 'manual', this.value)" class="${inputClass}" ${dis}></td><td class="p-2 sm:p-3 text-center bg-rose-50/20"><input type="number" step="any" value="${m.rusak||''}" oninput="updateMutasiRow(${idx}, 'rusak', this.value)" class="${inputClass}" ${dis}></td><td class="p-2 sm:p-3 text-center font-black text-blue-700 bg-blue-50/30 text-sm sm:text-base" id="td-shrs-${idx}">${m.seharusnya}</td><td class="p-2 sm:p-3 text-center bg-amber-50/50 border-x border-amber-200"><input type="number" step="any" value="${m.fisik}" oninput="updateMutasiRow(${idx}, 'fisik', this.value)" placeholder="Wajib" class="w-full text-center font-black text-amber-700 border-2 border-amber-400 rounded-lg p-2 outline-none transition shadow-sm bg-amber-100/50 placeholder:text-amber-300 ${m.isLocked ? 'opacity-50' : 'focus:ring-2 focus:ring-amber-500'}" ${dis}></td><td class="p-2 sm:p-3 text-center font-black text-sm sm:text-lg bg-slate-50 ${selisihColor}" id="td-slsh-${idx}">${m.selisih}</td></tr>`;
    });
    
    if(adaPerubahan && !mutasiDraftHariIni[0]?.isLocked) document.getElementById('mutasiAlert').classList.remove('hidden'); 
    else document.getElementById('mutasiAlert').classList.add('hidden');
};

window.updateMutasiRow = (idx, field, val) => { 
    const item = mutasiDraftHariIni[idx]; 
    item[field] = (val === '') ? (field === 'fisik' ? '' : 0) : parseFloat(val) || 0; 
    item.seharusnya = formatDec(item.sisaKemarin + (item.masuk || 0) - item.potongKasir - (item.manual || 0) - (item.rusak || 0)); 
    item.selisih = (item.fisik !== '') ? formatDec(item.fisik - item.seharusnya) : 0; 
    
    document.getElementById(`td-shrs-${idx}`).innerText = item.seharusnya; 
    const elSelisih = document.getElementById(`td-slsh-${idx}`); 
    elSelisih.innerText = item.selisih; 
    elSelisih.className = `p-2 sm:p-3 text-center font-black text-sm sm:text-lg bg-slate-50 ${item.selisih < 0 ? 'text-rose-600 bg-rose-50' : (item.selisih > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400')}`;
    document.getElementById('mutasiAlert').classList.remove('hidden'); 
    
    clearTimeout(mutasiSaveTimeout); 
    mutasiSaveTimeout = setTimeout(() => { 
        mutasiDraftHariIni.forEach(m => { window.mutasiDrafts[m.draftKey] = { masuk: m.masuk, manual: m.manual, rusak: m.rusak, fisik: m.fisik }; }); 
        localStorage.setItem('mutasiDrafts', JSON.stringify(window.mutasiDrafts)); 
    }, 1000);
};

window.simpanMutasiStok = async () => {
    if(!auth.currentUser) return; 
    if (mutasiDraftHariIni.some(m => m.fisik === '')) return showToast('Semua kolom FISIK WAJIB diisi!', 'error'); 
    const tglFilter = document.getElementById('filterTglMutasi').value; 
    const isToday = (tglFilter === getTodayYMD());
    
    window.showModal("Konfirmasi Mutasi", "Data akan disubmit dan dikunci. Lanjutkan?", async () => { 
        showLoading("Menyimpan..."); 
        for (let m of mutasiDraftHariIni) { 
            const dataLama = m.docId ? mutasiDB.find(x => x.id === m.docId) : null; 
            const selisihLama = dataLama ? dataLama.selisih : 0; 
            const selisihDiff = formatDec(m.selisih - selisihLama);
            const payload = { tanggal: tglFilter, timestamp: Date.now(), role: currentUser.role, idStok: m.idStok, namaBarang: m.nama, sisaKemarin: m.sisaKemarin, masuk: m.masuk, potongKasir: m.potongKasir, manual: m.manual, rusak: m.rusak, seharusnya: m.seharusnya, fisik: m.fisik, selisih: m.selisih, isUnlocked: false }; 
            
            if (m.docId) await setDoc(getDocRef('stock_mutations', m.docId), payload, { merge: true }); 
            else await addDoc(getColRef('stock_mutations'), payload); 
            
            const stokMaster = stocksDB.find(s => s.id === m.idStok);
            if(stokMaster) { 
                if (isToday) { await setDoc(getDocRef('stocks', m.idStok), { stokSaatIni: m.fisik }, { merge: true }); } 
                else { await setDoc(getDocRef('stocks', m.idStok), { stokSaatIni: formatDec((parseFloat(stokMaster.stokSaatIni)||0) + selisihDiff) }, { merge: true }); } 
            }
            delete window.mutasiDrafts[m.draftKey]; 
        } 
        localStorage.setItem('mutasiDrafts', JSON.stringify(window.mutasiDrafts)); 
        hideLoading(); 
        showToast("Berhasil Disimpan!", "success"); 
        setTimeout(() => window.loadMutasiDataUI(), 500); 
    });
};

window.ajukanBukaKunci = async () => {
    const tgl = document.getElementById('filterTglMutasi').value; 
    const exists = requestsDB.some(r => r.tanggal === tgl && r.role === currentUser.role && r.type === 'unlock_mutasi'); 
    if (exists) return showToast("Pengajuan dikirim, tunggu Manager!", "info");
    
    showLoading("Mengirim Pengajuan..."); 
    try { 
        await addDoc(getColRef('requests'), { type: 'unlock_mutasi', role: currentUser.role, tanggal: tgl, timestamp: Date.now() }); 
        hideLoading(); showToast("Pengajuan terkirim!", "success"); 
    } catch (err) { 
        hideLoading(); showToast("Gagal mengirim", "error"); 
    }
};

window.renderManagerMutasi = () => {
    const tgl = document.getElementById('filterTglMutasiManager').value; 
    const pic = document.getElementById('filterPicMutasiManager').value; 
    const tbl = document.getElementById('tblMutasiManager'); 
    tbl.innerHTML = '';
    
    let data = mutasiDB.filter(m => m.tanggal === tgl); 
    if (pic !== 'ALL') data = data.filter(m => m.role === pic); 
    data.sort((a, b) => a.namaBarang.localeCompare(b.namaBarang));
    
    const btnBuka = document.getElementById('btnBukaKunciManager'); 
    if (pic !== 'ALL' && data.length > 0) { btnBuka.classList.remove('hidden'); } 
    else { btnBuka.classList.add('hidden'); }
    
    if(data.length === 0) { 
        tbl.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold border-b border-dashed border-slate-200"><i class="fas fa-folder-open text-3xl mb-2 opacity-50 block"></i>Belum ada data mutasi yang disubmit.</td></tr>`; return; 
    }
    
    data.forEach(m => {
        let selisihColor = "text-slate-400"; 
        if (m.selisih < 0) selisihColor = "text-rose-600 bg-rose-50"; 
        if (m.selisih > 0) selisihColor = "text-emerald-600 bg-emerald-50";
        tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-2 sm:p-3 pl-3 sm:pl-4 font-black text-slate-800 whitespace-nowrap">${m.namaBarang} <span class="text-[9px] text-slate-400 font-bold uppercase block">PIC: ${m.role}</span></td><td class="p-2 sm:p-3 text-center text-slate-400 font-black border-l border-slate-100">${formatDec(m.sisaKemarin)}</td><td class="p-2 sm:p-3 text-center font-black text-emerald-600 bg-emerald-50/20">${formatDec(m.masuk)}</td><td class="p-2 sm:p-3 text-center font-black text-rose-500 bg-rose-50/20">${formatDec(m.potongKasir)}</td><td class="p-2 sm:p-3 text-center font-black text-rose-500 bg-rose-50/20">${formatDec(m.manual)}</td><td class="p-2 sm:p-3 text-center font-black text-rose-500 bg-rose-50/20">${formatDec(m.rusak)}</td><td class="p-2 sm:p-3 text-center font-black text-blue-700 bg-blue-50/30 text-sm sm:text-base border-l border-slate-100">${formatDec(m.seharusnya)}</td><td class="p-2 sm:p-3 text-center font-black text-amber-800 bg-amber-50 border-x border-amber-200 text-sm sm:text-base">${m.fisik}</td><td class="p-2 sm:p-3 text-center font-black text-sm sm:text-lg ${selisihColor}">${formatDec(m.selisih)}</td><td class="p-2 sm:p-3 text-center"><button onclick="bukaModalEditMutasiManager('${m.id}')" class="w-8 h-8 text-blue-500 hover:text-white hover:bg-blue-500 rounded-lg sm:rounded-xl transition shadow-sm border border-blue-100 flex items-center justify-center mx-auto" title="Koreksi Fisik"><i class="fas fa-edit text-[10px]"></i></button></td></tr>`;
    });
};

window.bukaKunciMutasiManager = () => {
    const pic = document.getElementById('filterPicMutasiManager').value; 
    const tgl = document.getElementById('filterTglMutasiManager').value; 
    if (pic === 'ALL') return showToast("Pilih Divisi/PIC tertentu dulu!", "error");
    
    window.showModal("Buka Kunci Mutasi", `Yakin membuka kunci mutasi ${pic} tanggal ${tgl} agar karyawan bisa input ulang?`, async () => { 
        showLoading("Membuka Kunci..."); 
        try { 
            const mutasiToUnlock = mutasiDB.filter(m => m.tanggal === tgl && m.role === pic); 
            for (let m of mutasiToUnlock) { await setDoc(getDocRef('stock_mutations', m.id), { isUnlocked: true }, { merge: true }); } 
            
            const reqToDelete = requestsDB.filter(r => r.tanggal === tgl && r.role === pic && r.type === 'unlock_mutasi'); 
            for (let r of reqToDelete) { await deleteDoc(getDocRef('requests', r.id)); } 
            
            hideLoading(); showToast("Kunci berhasil dibuka!", "success"); 
        } catch (e) { 
            console.error(e); hideLoading(); showToast("Gagal membuka kunci", "error"); 
        } 
    });
};

window.bukaModalEditMutasiManager = (id) => { 
    const mut = mutasiDB.find(m => m.id === id); 
    if(!mut) return; 
    document.getElementById('editMutasiDocId').value = mut.id; 
    document.getElementById('editMutasiItemName').innerText = mut.namaBarang + " (PIC: " + mut.role + ")"; 
    document.getElementById('editMutasiSeharusnya').innerText = formatDec(mut.seharusnya); 
    document.getElementById('editMutasiFisik').value = mut.fisik; 
    document.getElementById('modalEditMutasiManager').classList.remove('hidden'); 
};

window.simpanEditMutasiManager = async () => {
    const id = document.getElementById('editMutasiDocId').value; 
    const fisik = parseFloat(document.getElementById('editMutasiFisik').value); 
    if(!id || isNaN(fisik)) return; 
    showLoading("Mengoreksi...");
    try { 
        const mut = mutasiDB.find(m => m.id === id); 
        const seharusnya = mut.seharusnya; 
        const selisihBaru = formatDec(fisik - seharusnya); 
        const selisihDiff = formatDec(selisihBaru - mut.selisih); 
        
        await setDoc(getDocRef('stock_mutations', id), { fisik: fisik, selisih: selisihBaru }, { merge: true }); 
        const stokMaster = stocksDB.find(s => s.id === mut.idStok); 
        
        if (stokMaster) { 
            if (mut.tanggal === getTodayYMD()) { 
                await setDoc(getDocRef('stocks', mut.idStok), { stokSaatIni: fisik }, { merge: true }); 
            } else { 
                await setDoc(getDocRef('stocks', mut.idStok), { stokSaatIni: formatDec((parseFloat(stokMaster.stokSaatIni)||0) + selisihDiff) }, { merge: true }); 
            } 
        } 
        document.getElementById('modalEditMutasiManager').classList.add('hidden'); 
        showToast("Fisik Dikoreksi!"); 
    } catch (err) { 
        console.error(err); showToast("Gagal koreksi", "error"); 
    } 
    hideLoading();
};

window.renderLaporanStokUI = () => {
    const sd = document.getElementById('lsStartDate').value; 
    const ed = document.getElementById('lsEndDate').value; 
    const pic = document.getElementById('filterPicLaporanStok').value; 
    if(!sd || !ed) return;
    
    const start = new Date(sd).getTime(); 
    const end = new Date(ed).getTime() + 86400000; 
    let aggregated = {};
    
    mutasiDB.forEach(m => { 
        const tTime = new Date(m.tanggal).getTime(); 
        if(tTime >= start && tTime < end) { 
            if(pic === 'ALL' || m.role === pic) { 
                if(!aggregated[m.idStok]) { aggregated[m.idStok] = { nama: m.namaBarang, role: m.role, masuk: 0, potongKasir: 0, manual: 0, rusak: 0, selisih: 0 }; } 
                aggregated[m.idStok].masuk += (m.masuk || 0); 
                aggregated[m.idStok].potongKasir += (m.potongKasir || 0); 
                aggregated[m.idStok].manual += (m.manual || 0); 
                aggregated[m.idStok].rusak += (m.rusak || 0); 
                aggregated[m.idStok].selisih += (m.selisih || 0); 
            } 
        } 
    });
    
    const tbl = document.getElementById('tblLaporanStok'); tbl.innerHTML = ''; 
    const resultKeys = Object.keys(aggregated); 
    if(resultKeys.length === 0) { 
        tbl.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold border-b border-dashed border-slate-200"><i class="fas fa-box-open text-3xl mb-3 opacity-30 block"></i>Tidak ada data mutasi.</td></tr>`; return; 
    }
    
    const results = resultKeys.map(k => aggregated[k]).sort((a, b) => a.nama.localeCompare(b.nama));
    results.forEach(m => { tbl.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-50"><td class="p-4 pl-5 font-black text-slate-800">${m.nama} <br><span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">PIC: ${m.role}</span></td><td class="p-4 text-center font-black text-emerald-600 bg-emerald-50/20">${formatDec(m.masuk)}</td><td class="p-4 text-center font-black text-amber-600">${formatDec(m.potongKasir)}</td><td class="p-4 text-center font-black text-rose-500">${formatDec(m.manual)}</td><td class="p-4 text-center font-black text-rose-600 bg-rose-50/20">${formatDec(m.rusak)}</td><td class="p-4 text-center font-black ${m.selisih < 0 ? 'text-rose-600' : (m.selisih > 0 ? 'text-emerald-600' : 'text-slate-500')}">${formatDec(m.selisih)}</td></tr>`; });
};

// DASHBOARD MANAGER
window.renderManagerDashboard = () => {
    if(!currentUser || currentUser.role !== 'admin') return;
    
    let sd = document.getElementById('dashStartDate').value; 
    let ed = document.getElementById('dashEndDate').value; 
    if(!sd || !ed) { 
        const dEnd = new Date(); 
        const dStart = new Date(); 
        dStart.setDate(dEnd.getDate() - 6); 
        ed = dEnd.toISOString().split('T')[0]; 
        sd = dStart.toISOString().split('T')[0]; 
        document.getElementById('dashStartDate').value = sd; 
        document.getElementById('dashEndDate').value = ed; 
    }
    
    const dates = []; let currDate = new Date(sd); const endDate = new Date(ed); 
    let diffDays = (endDate - currDate) / (1000 * 60 * 60 * 24); 
    if(diffDays > 31 || diffDays < 0) { showToast("Range maksimal 31 hari!", "error"); return; } 
    while(currDate <= endDate) { dates.push(currDate.toISOString().split('T')[0]); currDate.setDate(currDate.getDate() + 1); }
    
    const labels = []; const incomeData = []; const expenseData = []; let itemSales = {}; 
    const selectEl = document.getElementById('dashTopMenuKategori'); 
    let currentKat = selectEl ? selectEl.value : 'ALL';

    dates.forEach(dStr => {
        const parts = dStr.split('-'); labels.push(parts[2] + '/' + parts[1]); 
        let dayIncome = 0; let dayExpense = 0;
        transactionsDB.filter(t => t.tanggal === dStr && t.status === 'Aktif').forEach(t => { 
            dayIncome += t.total; 
            t.cart.forEach(c => { 
                const menuRef = menusDB.find(m => m.nama === c.nama); 
                const kat = menuRef ? menuRef.kategori.toUpperCase() : 'UMUM'; 
                if(currentKat === 'ALL' || kat === currentKat) { itemSales[c.nama] = (itemSales[c.nama] || 0) + c.qty; } 
            }); 
        });
        expensesDB.filter(e => e.tanggal === dStr).forEach(e => dayExpense += e.nominal); 
        incomeData.push(dayIncome); expenseData.push(dayExpense);
    });

    if (selectEl) { 
        let allKats = ['ALL', ...new Set(menusDB.map(m => m.kategori.toUpperCase()))]; 
        selectEl.innerHTML = ''; 
        allKats.forEach(k => { selectEl.innerHTML += `<option value="${k}" ${currentKat === k ? 'selected' : ''}>${k === 'ALL' ? 'SEMUA KATEGORI' : k}</option>`; }); 
    }
    
    let totalRev = incomeData.reduce((a, b) => a + b, 0); 
    let avgRev = dates.length > 0 ? totalRev / dates.length : 0; 
    let avgEl = document.getElementById('avgDailyRevenue'); 
    if(avgEl) avgEl.innerText = formatIDR(avgRev);

    const ctx = document.getElementById('financeChart').getContext('2d'); 
    if(window.myChart) window.myChart.destroy(); 
    window.myChart = new Chart(ctx, { 
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [ 
                { label: 'Omset', data: incomeData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, tension: 0.4, fill: true }, 
                { label: 'Pengeluaran', data: expenseData, borderColor: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.1)', borderWidth: 2, borderDash: [5, 5], tension: 0.4, fill: true } 
            ] 
        }, 
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: { family: 'Inter', weight: 'bold' } } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: function(val) { if(val >= 1000000) return 'Rp ' + (val/1000000).toFixed(1).replace('.0','') + ' Jt'; if(val >= 1000) return 'Rp ' + (val/1000) + ' Rb'; return 'Rp ' + val; } } }, x: { grid: { display: false } } } } 
    });

    const topMenuCont = document.getElementById('topMenuContainer'); topMenuCont.innerHTML = ''; 
    const sortedMenu = Object.entries(itemSales).sort((a,b) => b[1] - a[1]);
    if(sortedMenu.length === 0) { 
        topMenuCont.innerHTML = `<div class="p-4 text-center text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">Belum ada penjualan di periode ini.</div>`; 
    } else { 
        sortedMenu.slice(0, 5).forEach((item, index) => { 
            let badge = "bg-slate-100 text-slate-500"; 
            if(index === 0) badge = "bg-amber-100 text-amber-600 shadow-sm border border-amber-200"; 
            else if(index === 1) badge = "bg-slate-200 text-slate-700 shadow-sm border border-slate-300"; 
            else if(index === 2) badge = "bg-orange-100 text-orange-700 shadow-sm border border-orange-200"; 
            topMenuCont.innerHTML += `<div class="flex items-center justify-between p-3 border-b border-slate-50 hover:bg-slate-50 rounded-xl transition"><div class="flex items-center space-x-3"><div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${badge}">${index+1}</div><span class="font-bold text-xs text-slate-700">${item[0]}</span></div><span class="font-black text-emerald-600 text-xs">${item[1]} <span class="text-[9px] text-slate-400">Porsi</span></span></div>`; 
        }); 
    }

    const approvalsCont = document.getElementById('notif-approval');
    const stockCont = document.getElementById('notif-stock');
    const taskCont = document.getElementById('notif-task');
    if(approvalsCont) approvalsCont.innerHTML = ''; 
    if(stockCont) stockCont.innerHTML = '';
    if(taskCont) taskCont.innerHTML = '';
    
    // 1. Notifikasi Persetujuan (Tab Revisi)
    const pendingReqs = requestsDB.filter(r => r.type === 'unlock_mutasi');
    if(pendingReqs.length === 0 && approvalsCont) {
        approvalsCont.innerHTML = `<div class="text-[10px] text-slate-400 font-bold text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">Tidak ada pengajuan.</div>`;
    } else if(approvalsCont) {
        pendingReqs.forEach(r => { 
            approvalsCont.innerHTML += `<div class="p-3 bg-blue-50 rounded-xl border border-blue-100 flex flex-col space-y-3 shadow-sm mb-3">
                <div class="flex items-start space-x-2"><i class="fas fa-key text-blue-500 mt-0.5"></i><div><h5 class="text-xs font-black text-blue-700">Revisi Mutasi Harian</h5><p class="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Divisi ${r.role} • Tgl: ${r.tanggal}</p></div></div>
                <div class="flex space-x-2 pt-2 border-t border-blue-100">
                    <button onclick="approveRequest('${r.id}', '${r.role}', '${r.tanggal}')" class="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest rounded-lg transition shadow-sm">Setujui</button>
                    <button onclick="rejectRequest('${r.id}')" class="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-[9px] uppercase tracking-widest rounded-lg transition">Tolak</button>
                </div>
            </div>`; 
        });
    }
    
    // 2. Peringatan Stok Kritis (Tab Stok)
    let stockAlertCount = 0;
    stocksDB.filter(s => (parseFloat(s.stokSaatIni)||0) <= (parseFloat(s.stokMinimal)||0)).forEach(s => { 
        stockAlertCount++;
        if(stockCont) stockCont.innerHTML += `<div class="p-3 bg-rose-50 rounded-xl border border-rose-100 flex items-start space-x-3 mb-2"><i class="fas fa-exclamation-circle text-rose-500 mt-0.5"></i><div><h5 class="text-xs font-black text-rose-700">Stok Kritis: ${s.nama}</h5><p class="text-[10px] font-bold text-rose-500">Sisa ${formatDec(s.stokSaatIni)} ${s.satuan}</p></div></div>`; 
    });
    if(stockAlertCount === 0 && stockCont) stockCont.innerHTML = `<div class="text-[10px] text-slate-400 font-bold text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">Stok aman terkendali.</div>`;

    // 3. Peringatan Tugas (Tab Tugas) -> Perbaikan BUG UNDEFINED ada disini
    let taskAlertCount = 0;
    const todayYMD = getTodayYMD(); 
    // Filter mengabaikan admin, teks kosong, nilai null, dan teks 'undefined'
    const requiredRoles = [...new Set(stocksDB.map(s => s.role))].filter(r => r && r !== 'admin' && r !== 'undefined'); 
    const submittedRoles = [...new Set(mutasiDB.filter(m => m.tanggal === todayYMD).map(m => m.role))]; 
    
    requiredRoles.forEach(r => { 
        if(!submittedRoles.includes(r)) { 
            taskAlertCount++;
            if(taskCont) taskCont.innerHTML += `<div class="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start space-x-3 mb-2"><i class="fas fa-clock text-amber-500 mt-0.5"></i><div><h5 class="text-xs font-black text-amber-700">Tugas Belum Selesai</h5><p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Tim ${r} belum submit mutasi.</p></div></div>`; 
        } 
    });
    if(taskAlertCount === 0 && taskCont) taskCont.innerHTML = `<div class="text-[10px] text-slate-400 font-bold text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">Semua divisi sudah submit mutasi.</div>`;

// Fungsi Aksi Setujui & Tolak
window.approveRequest = async (reqId, role, tgl) => {
    showLoading("Menyetujui Akses...");
    try {
        const mutasiToUnlock = mutasiDB.filter(m => m.tanggal === tgl && m.role === role); 
        for (let m of mutasiToUnlock) { await setDoc(getDocRef('stock_mutations', m.id), { isUnlocked: true }, { merge: true }); }
        await deleteDoc(getDocRef('requests', reqId));
        hideLoading(); showToast("Akses Revisi Diberikan!", "success");
        renderManagerDashboard();
    } catch(e) { console.error(e); hideLoading(); showToast("Gagal menyetujui", "error"); }
};

window.rejectRequest = async (reqId) => {
    showLoading("Menolak...");
    try {
        await deleteDoc(getDocRef('requests', reqId));
        hideLoading(); showToast("Pengajuan Ditolak.");
        renderManagerDashboard();
    } catch(e) { hideLoading(); showToast("Gagal menolak", "error"); }
};

window.renderRekapMenuTab = () => {
    const sd = document.getElementById('rmStartDate').value; 
    const ed = document.getElementById('rmEndDate').value; 
    const filterDropdown = document.getElementById('rmKategoriFilter');
    const filterKategori = filterDropdown ? filterDropdown.value : 'ALL';

    if(!sd || !ed) { 
        const dEnd = new Date(); const dStart = new Date(); dStart.setDate(dEnd.getDate() - 6); 
        document.getElementById('rmStartDate').value = dStart.toISOString().split('T')[0]; 
        document.getElementById('rmEndDate').value = dEnd.toISOString().split('T')[0]; 
        setTimeout(window.renderRekapMenuTab, 50); return; 
    }
    
    let itemSales = {}; let itemRevenue = {}; 
    const start = new Date(sd).getTime(); const end = new Date(ed).getTime() + 86400000;
    
    transactionsDB.filter(t => t.status === 'Aktif').forEach(t => { 
        const tTime = new Date(t.tanggal).getTime(); 
        if(tTime >= start && tTime < end) { 
            t.cart.forEach(c => { 
                itemSales[c.nama] = (itemSales[c.nama] || 0) + c.qty; 
                const harga = t.tipeOrder === 'DineIn' ? c.hargaDineIn : c.hargaGojek; 
                itemRevenue[c.nama] = (itemRevenue[c.nama] || 0) + (harga * c.qty); 
            }); 
        } 
    });
    
    let allItems = []; 
    let kategories = ['ALL', 'MAKANAN', 'MINUMAN', 'TAMBAHAN'];
    
    menusDB.forEach(m => { 
        const sold = itemSales[m.nama] || 0; 
        const rev = itemRevenue[m.nama] || 0; 
        if(!kategories.includes(m.kategori.toUpperCase())) kategories.push(m.kategori.toUpperCase());
        if(sold > 0) { allItems.push({ nama: m.nama, kategori: m.kategori, qty: sold, rev: rev }); } 
    });

    const selectEl = document.getElementById('rmKategoriFilter');
    if (selectEl && selectEl.options.length <= 1) {
        selectEl.innerHTML = '';
        kategories.forEach(k => { selectEl.innerHTML += `<option value="${k}">${k === 'ALL' ? 'SEMUA KATEGORI' : k}</option>`; });
        selectEl.value = filterKategori;
    }

    let filteredItems = allItems;
    if(filterKategori !== 'ALL') {
        filteredItems = allItems.filter(m => m.kategori.toUpperCase() === filterKategori);
    }

    const top5Cont = document.getElementById('top5MenuCards'); top5Cont.innerHTML = ''; 
    const top5 = [...filteredItems].sort((a,b) => b.qty - a.qty).slice(0, 5);
    
    if(top5.length === 0) { top5Cont.innerHTML = `<div class="col-span-full p-4 text-center text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">Belum ada penjualan.</div>`; } 
    else { const colors = ['text-amber-500 bg-amber-50 border-amber-200', 'text-slate-500 bg-slate-50 border-slate-200', 'text-orange-500 bg-orange-50 border-orange-200', 'text-blue-500 bg-blue-50 border-blue-200', 'text-emerald-500 bg-emerald-50 border-emerald-200']; top5.forEach((m, idx) => { top5Cont.innerHTML += `<div class="bg-white border ${colors[idx].split(' ')[2]} rounded-xl p-3 flex flex-col items-center text-center shadow-sm relative overflow-hidden"><div class="absolute -right-2 -top-2 w-8 h-8 rounded-full ${colors[idx].split(' ')[1]} flex items-center justify-center font-black text-[10px] ${colors[idx].split(' ')[0]}">${idx+1}</div><h5 class="text-[10px] font-black text-slate-700 leading-tight mb-2 mt-1 h-6 flex items-center justify-center">${m.nama}</h5><div class="text-xl font-black ${colors[idx].split(' ')[0]} mb-1">${m.qty} <span class="text-[9px] text-slate-400 uppercase">Porsi</span></div><div class="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">${formatIDR(m.rev)}</div></div>`; }); }

    const tbl = document.getElementById('tblRekapMenuTab'); tbl.innerHTML = '';
    if(allItems.length === 0) { tbl.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-slate-400 font-bold border-b border-dashed border-slate-200">Tidak ada data keseluruhan.</td></tr>`; } 
    else { let kategoriesAll = [...new Set([...['MAKANAN', 'MINUMAN', 'TAMBAHAN'], ...allItems.map(m => m.kategori.toUpperCase())])]; kategoriesAll.forEach(cat => { let itemsInCat = allItems.filter(m => m.kategori.toUpperCase() === cat).sort((a,b) => b.qty - a.qty); if(itemsInCat.length > 0) { tbl.innerHTML += `<tr><td colspan="3" class="p-3 pl-5 bg-slate-50 font-black text-slate-600 text-[10px] uppercase tracking-widest border-y border-slate-100"><i class="fas fa-tag text-amber-500 mr-2"></i>KATEGORI: ${cat}</td></tr>`; itemsInCat.forEach(m => { tbl.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="p-4 pl-5 font-bold text-slate-700">${m.nama}</td><td class="p-4 text-center font-black text-emerald-600">${m.qty} Porsi</td><td class="p-4 text-right pr-6 font-black text-slate-800">${formatIDR(m.rev)}</td></tr>`; }); } }); }
};

// --- FITUR TONG SAMPAH KASIR ---
window.renderTrashUI = () => {
    const container = document.getElementById('trashContainer');
    container.innerHTML = '';
    
    // Logika Auto-delete (48 Jam = 48 * 60 * 60 * 1000 milidetik)
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    
    let validTrash = [];
    trashedBillsDB.forEach(tb => {
        if(now - tb.deleteTimestamp > fortyEightHours) {
            deleteDoc(getDocRef('trashed_bills', tb.id)); // Hapus permanen dari Cloud jika lebih 48 jam
        } else {
            validTrash.push(tb);
        }
    });

    if(validTrash.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-bold bg-white border border-slate-200 border-dashed rounded-3xl"><i class="fas fa-trash-alt text-4xl mb-3 opacity-50 block"></i>Tong sampah kosong.</div>`;
        return;
    }

    validTrash.sort((a,b) => b.deleteTimestamp - a.deleteTimestamp).forEach(tb => {
        let title = tb.originalSource === 'saved_bills' ? `Nota Tunda: ${tb.namaTunda}` : `Trx #${tb.noNota}`;
        let badgeColor = tb.originalSource === 'saved_bills' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
        let badgeText = tb.originalSource === 'saved_bills' ? 'DARI NOTA TUNDA' : 'DARI TRANSAKSI';
        
        let timeLeftMs = fortyEightHours - (now - tb.deleteTimestamp);
        let hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
        if(hoursLeft < 1) hoursLeft = "< 1";
        
        container.innerHTML += `<div class="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-rose-400 transition">
            <div>
                <div class="flex justify-between items-start mb-2">
                    <span class="px-2.5 py-1 ${badgeColor} text-[9px] font-black uppercase tracking-widest rounded-lg">${badgeText}</span>
                    <span class="text-[9px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-md uppercase tracking-widest border border-rose-100"><i class="fas fa-clock mr-1"></i>Sisa ${hoursLeft} Jam</span>
                </div>
                <h4 class="text-sm font-black text-slate-800 mb-1">${title}</h4>
                <p class="text-[10px] text-slate-500 font-medium">Customer: ${tb.customer} | Kasir: ${tb.kasir}</p>
                <p class="text-[10px] text-slate-500 font-medium mt-1">Total: <span class="font-black">${formatIDR(tb.total || tb.subtotal)}</span></p>
            </div>
            <div class="flex space-x-2 mt-4 pt-4 border-t border-slate-100">
                <button onclick="restoreTrash('${tb.id}')" class="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white font-black text-xs uppercase tracking-widest rounded-xl transition shadow-sm border border-emerald-200"><i class="fas fa-trash-restore mr-2"></i>Restore</button>
                <button onclick="hapusPermanenTrash('${tb.id}')" title="Hapus Permanen Sekarang" class="w-10 h-10 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition flex items-center justify-center border border-rose-100"><i class="fas fa-times"></i></button>
            </div>
        </div>`;
    });
};

    window.restoreTrash = async (id) => {
    const dataAwal = trashedBillsDB.find(t => t.id === id);
    if(!dataAwal) return;
    
    // Kloning data agar tidak merusak memori lokal browser yang memicu bug duplikat
    const tb = JSON.parse(JSON.stringify(dataAwal)); 
    
    showLoading("Merestore Nota...");
    try {
        let originalSource = tb.originalSource;
        delete tb.originalSource;
        delete tb.deleteTimestamp;
        
        if (originalSource === 'transactions') {
            tb.status = 'Aktif'; // Set kembali ke status Aktif
            // Karena jadi aktif lagi, potong kembali stok gudangnya
            let itemsTerjual = {}; 
            tb.cart.forEach(c => { itemsTerjual[c.nama.toLowerCase()] = (itemsTerjual[c.nama.toLowerCase()] || 0) + c.qty; });
            
            for (let stok of stocksDB) { 
                if (!stok.menuTerkait) continue; 
                const menusTerkait = stok.menuTerkait.split(',').map(m => m.trim().toLowerCase()); 
                let totalPotong = 0; 
                for (let nama in itemsTerjual) { 
                    if (menusTerkait.includes(nama)) totalPotong += itemsTerjual[nama]; 
                } 
                if (totalPotong > 0) { 
                    let currentStock = parseFloat(stok.stokSaatIni) || 0;
                    await setDoc(getDocRef('stocks', stok.id), { stokSaatIni: formatDec(currentStock - totalPotong) }, { merge: true }); 
                } 
            }
            await setDoc(getDocRef('transactions', id), tb); // Tarik kembali doc dengan id yang sama
        } else {
            await setDoc(getDocRef('saved_bills', id), tb); // Kembalikan ke nota tunda
        }
        
        await deleteDoc(getDocRef('trashed_bills', id)); // Hapus dari tong sampah
        hideLoading();
        showToast("Nota Berhasil Direstore!", "success");
    } catch(e) {
        console.error(e); hideLoading(); showToast("Gagal merestore", "error");
    }
};

window.hapusPermanenTrash = (id) => {
    window.showModal("Hapus Permanen", "Nota ini akan lenyap selamanya dan tidak bisa dikembalikan. Lanjutkan?", async () => {
        showLoading("Menghapus Permanen...");
        try {
            await deleteDoc(getDocRef('trashed_bills', id));
            showToast("Dihapus permanen.", "success");
        } catch (err) {
            console.error(err);
            showToast("Gagal menghapus", "error");
        }
        hideLoading();
    });
};
// ------------------------------

window.prosesTarikArsip = async () => {
    const startDate = document.getElementById('arsipStart').value;
    const endDate = document.getElementById('arsipEnd').value;
    
    if(!startDate || !endDate) return showToast("Pilih rentang tanggal!", "error");
    if(startDate > endDate) return showToast("Tanggal tidak valid!", "error");
    
    document.getElementById('modalArsip').classList.add('hidden');
    showLoading("Mengunduh Arsip...\n(Ini memakan waktu)");
    try {
        const fetchArchive = async (col) => { 
            const q = query(getColRef(col), where('tanggal', '>=', startDate), where('tanggal', '<=', endDate)); 
            const snap = await getDocs(q); 
            return snap.docs.map(docItem => ({id: docItem.id, ...docItem.data()})); 
        };
        
        const [trx, exp, cr, mut] = await Promise.all([fetchArchive('transactions'), fetchArchive('expenses'), fetchArchive('close_registers'), fetchArchive('stock_mutations')]);
        
        transactionsDB = Array.from(new Map([...trx, ...transactionsDB].map(item => [item.id, item])).values());
        expensesDB = Array.from(new Map([...exp, ...expensesDB].map(item => [item.id, item])).values());
        closeRegistersDB = Array.from(new Map([...cr, ...closeRegistersDB].map(item => [item.id, item])).values());
        mutasiDB = Array.from(new Map([...mut, ...mutasiDB].map(item => [item.id, item])).values());

        if(!document.getElementById('view-dashboard').classList.contains('hidden')) renderManagerDashboard();
        if(!document.getElementById('view-laporan').classList.contains('hidden')) renderLaporanUI();
        if(!document.getElementById('view-rekapmenu').classList.contains('hidden')) renderRekapMenuTab();
        if(!document.getElementById('view-laporanstok').classList.contains('hidden')) renderLaporanStokUI();
        if(!document.getElementById('view-tutupbuku').classList.contains('hidden')) renderManagerTutupBuku();
        if(!document.getElementById('view-mutasistok').classList.contains('hidden')) renderManagerMutasi();
        
        showToast("Arsip Berhasil Ditarik!", "success");
    } catch (e) { 
        console.error(e); showToast("Gagal menarik arsip.", "error"); 
    }
    hideLoading();
};

window.prosesExportExcelTb = async () => {
    const startDate = document.getElementById('excelTbStart').value;
    const endDate = document.getElementById('excelTbEnd').value;
    
    if(!startDate || !endDate) return showToast("Pilih rentang tanggal!", "error");
    if(startDate > endDate) return showToast("Rentang tidak valid!", "error");

    const diffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
    if(diffDays > 60) return showToast("Maksimal rentang 60 hari!", "error");

    document.getElementById('modalExcelTb').classList.add('hidden');
    showLoading("Mengambil Data Server...");

    try {
        const q = query(getColRef('close_registers'), where('tanggal', '>=', startDate), where('tanggal', '<=', endDate));
        const snap = await getDocs(q);
        let data = snap.docs.map(docItem => ({id: docItem.id, ...docItem.data()}));
        
        data.sort((a,b) => a.tanggal.localeCompare(b.tanggal));

        if(data.length === 0) {
            hideLoading();
            return showToast("Tidak ada data di rentang ini.", "error");
        }

        if (typeof ExcelJS === 'undefined') {
            hideLoading();
            return showToast("Alat pembuat Excel belum siap.", "error");
        }

        showLoading("Mencetak Excel...");
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Laporan Tutup Buku');
        
        ws.columns = [
            { header: '', key: 'tgl', width: 15 }, { header: '', key: 'kasir', width: 18 },
            { header: '', key: 'awal', width: 18 }, { header: '', key: 'out', width: 18 },
            { header: '', key: 'cash', width: 18 }, { header: '', key: 'tf', width: 18 },
            { header: '', key: 'ditinggal', width: 18 }, { header: '', key: 'fisik', width: 20 },
            { header: '', key: 'selisih', width: 22 }
        ];

        ws.mergeCells('A1:I1');
        const titleRow = ws.getCell('A1');
        titleRow.value = 'LAPORAN TUTUP BUKU - PAWON NUSANTARA';
        titleRow.font = { size: 16, bold: true };
        titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }; 

        ws.mergeCells('A2:I2');
        ws.getCell('A2').value = `Periode: ${startDate.split('-').reverse().join('/')} s/d ${endDate.split('-').reverse().join('/')}`;
        ws.getCell('A2').font = { bold: true };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ws.mergeCells('A3:I3');
        const d = new Date();
        ws.getCell('A3').value = `Dicetak pada: ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}`;
        ws.getCell('A3').font = { italic: true };
        ws.getCell('A3').alignment = { horizontal: 'center' };

        const headers = ['Tanggal', 'Nama Kasir', 'Angsulan Awal', 'Pengeluaran', 'Total Cash', 'Total TF', 'Angsulan Ditinggal', 'Setoran Fisik Real', 'Status Selisih'];
        ws.addRow(headers);
        const headerRow = ws.getRow(5);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        
        for(let i = 1; i <= 9; i++) {
            ws.getCell(5, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
        }

        let sumAwal = 0, sumOut = 0, sumCash = 0, sumTf = 0, sumDitinggal = 0, sumFisik = 0, sumSelisih = 0;

        data.forEach(item => {
            sumAwal += item.angsulanAwal || 0; sumOut += item.pengeluaran || 0;
            sumCash += item.penjualanCash || 0; sumTf += item.penjualanTf || 0;
            sumDitinggal += item.angsulanDitinggal || 0; sumFisik += item.setoranCashReal || 0;
            sumSelisih += item.selisihSetoran || 0;

            let selisihTeks = item.selisihSetoran === 0 ? 'KLOP (Rp 0)' : (item.selisihSetoran > 0 ? `+ Rp ${item.selisihSetoran.toLocaleString('id-ID')}` : `- Rp ${Math.abs(item.selisihSetoran).toLocaleString('id-ID')}`);
            
            const row = ws.addRow([
                item.tanggal.split('-').reverse().join('/'), item.kasir, item.angsulanAwal,
                item.pengeluaran, item.penjualanCash, item.penjualanTf,
                item.angsulanDitinggal, item.setoranCashReal, selisihTeks
            ]);

            for(let i = 3; i <= 8; i++) { row.getCell(i).numFmt = '"Rp" #,##0'; }
            
            const sel = row.getCell(9);
            sel.font = { bold: true };
            if (item.selisihSetoran < 0) sel.font.color = { argb: 'FFFF0000' };
            else if (item.selisihSetoran > 0) sel.font.color = { argb: 'FF0000FF' };
            else sel.font.color = { argb: 'FF008000' };
        });

        const totalRow = ws.addRow([ 'TOTAL AKUMULASI', '', sumAwal, sumOut, sumCash, sumTf, sumDitinggal, sumFisik, sumSelisih < 0 ? `- Rp ${Math.abs(sumSelisih).toLocaleString('id-ID')}` : `+ Rp ${sumSelisih.toLocaleString('id-ID')}` ]);
        totalRow.font = { bold: true };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } };
        for(let i = 3; i <= 8; i++) { totalRow.getCell(i).numFmt = '"Rp" #,##0'; }

        ws.views = [{ state: 'frozen', ySplit: 5 }];

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tutup_Buku_${startDate}_sd_${endDate}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        hideLoading();
        showToast("Excel berhasil diunduh!", "success");
    } catch (e) {
        console.error(e);
        hideLoading();
        showToast("Gagal membuat Excel", "error");
    }
};

window.switchNotifTab = (tabName) => {
    ['approval', 'stock', 'task'].forEach(t => {
        document.getElementById(`notif-${t}`).classList.add('hidden');
        const btn = document.getElementById(`btnNotif-${t}`);
        btn.classList.remove('bg-white', 'text-blue-600', 'shadow-sm', 'border', 'border-slate-200');
        btn.classList.add('text-slate-400');
    });
    document.getElementById(`notif-${tabName}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`btnNotif-${tabName}`);
    activeBtn.classList.remove('text-slate-400');
    activeBtn.classList.add('bg-white', 'text-blue-600', 'shadow-sm', 'border', 'border-slate-200');
};

// INITIALIZE APP
initApp();
