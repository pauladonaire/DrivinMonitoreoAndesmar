/* ============================================================
   config.js — Constantes globales de la aplicación
   ============================================================ */

const API_KEY          = '69191355-f4d1-40e4-bc2f-087b4451f59d';
const PODS_ENDPOINT    = 'https://external.driv.in/api/external/v2/pods';
const PODS_V3_ENDPOINT = 'https://external.driv.in/api/external/v3/pods';
const USERS_ENDPOINT   = 'https://external.driv.in/api/external/v2/users?role_name=driver';
const EMAIL_DESTINO    = 'pauladonaire@andesmar.com.ar';

// Google Sheets API — para login y gestión de usuarios (solo lectura)
const SHEETS_API_KEY  = 'AIzaSyBqsKySJZCQJ08eImBuMGyDjaISldwD0v4';
const USERS_SHEET_ID  = '1-Ygy8Q2aTKHJSw_seauqMObp4GLHPbD-0uds9pfWOr0';

// Google Apps Script Web App — maneja emails, Sheets y cierre automático
// Redeploy en script.google.com si el código GAS cambia (misma URL)
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycby0MDTJ9-Hvqww_Ze4ILTHUlAYzmc5RUo5UZ8pSnvBUDit1tMGxMFVF3xvyplNOO7h37A/exec';

const REFRESH_INTERVAL_MS = 300000; // 5 minutos
const PAGE_SIZE           = 20;
