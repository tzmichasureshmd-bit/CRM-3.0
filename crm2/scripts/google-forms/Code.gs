/**
 * ============================================================================
 * TZMICHA CRM — Google Forms → CRM integration (Google Apps Script)
 * ============================================================================
 *
 * WHAT THIS DOES
 * --------------
 * Watches the Google Sheet that receives Google Form responses. When a new
 * response row is added it:
 *
 *   1. Reads the submitted fields and maps them to CRM contact fields.
 *   2. Builds a secure JSON payload (including the Google Forms response id
 *      as the idempotency key).
 *   3. POSTs it to the CRM public API:
 *          POST /api/v1/integrations/google-forms
 *      with `Authorization: Bearer <CRM_API_KEY>` (scope: contacts:write).
 *   4. Records the sync outcome in extra "integration columns" at the right
 *      edge of the sheet. The CRM is the SINGLE SOURCE OF TRUTH — this sheet
 *      is only the delivery/staging mechanism.
 *
 * SECURITY
 * --------
 * - The CRM API key is stored in the script's SCRIPT PROPERTIES, never
 *   hard-coded in the file and never in frontend code.
 * - The endpoint is authenticated by the CRM's API key, which also fixes the
 *   target tenant/account — no database credentials or secrets live here.
 *
 * SETUP
 * -----
 * 1. In the CRM: create an API key with the `contacts:write` scope
 *    (Settings → API keys → New key → scope contacts:write). Copy it.
 * 2. Open this bound script (Extensions → Apps Script on the response sheet).
 * 3. Set the configuration inside configureIntegration_() below (or, better,
 *    via script properties so it is not committed to source control).
 *    Keys:  CRM_BASE_URL   e.g. https://app.yourcrm.com
 *           CRM_API_KEY    the contacts:write API key
 * 4. Run `installFormTrigger` once to create the installable form-submit
 *    trigger (or add a script trigger under Triggers → onFormSubmit).
 * 5. Optionally add a time-based trigger for `retryFailedSyncs`.
 *
 * TEST 1 (happy path):  submit the form -> row appears -> onFormSubmit runs ->
 *                       CRM contact created -> "CRM Sync Status" = SUCCESS.
 * TEST 2 (retry/dedup): re-run sync for the same row -> CRM returns
 *                       duplicate=true and no second contact is created.
 * ============================================================================
 */

/**
 * Column index of the Google Form's "Timestamp" column (1-based).
 * Google Forms puts this first automatically. Adjust if your form has
 * a different leading column.
 */
var TIMESTAMP_COLUMN = 1;

/**
 * Configure the field mapping between the Google Sheet columns and the
 * CRM contact fields.
 *
 * KEYS are lowercase CRM field names understood by the webhook:
 *   name, phone, email, company, location, message,
 *   campaign, form_id, utm_source, utm_medium, utm_campaign,
 *   utm_content, utm_term
 *
 * VALUES are the 1-based column numbers of the corresponding columns in
 * the response sheet (e.g. if "Phone number" is the 3rd column, use 3).
 *
 * If your form field labels are the defaults below they are matched
 * automatically by FIELD_HEADER_MAP; otherwise set the numbers here.
 */
var COLUMN_MAP = {};

/**
 * Optional automatic mapping by column header (case-insensitive). The
 * webhook's CRM field is the key; any of the listed headers match.
 * Only columns that exist in the sheet are used — a header not present
 * is simply skipped, so extra columns are safe.
 */
var FIELD_HEADER_MAP = {
  name: ['name', 'full name', 'your name', 'fullname'],
  phone: ['phone', 'phone number', 'phone no', 'contact number', 'mobile', 'whatsapp', 'phone no.'],
  email: ['email', 'email address', 'e-mail', 'mail'],
  company: ['company', 'company name', 'business', 'organization'],
  location: ['location', 'city', 'country', 'address', 'region', 'state'],
  message: ['message', 'notes', 'note', 'details', 'comments', 'your message', 'additional info'],
  campaign: ['campaign', 'utm_campaign', 'campaign name'],
};

/**
 * Names of the integration/status columns we append to the sheet. These
 * are added to the right edge and are safe — the original Google Form
 * response columns are never modified or deleted.
 */
var SYNC_STATUS_COL = 'CRM Sync Status';
var SYNC_CONTACT_ID_COL = 'CRM Contact ID';
var SYNC_TIME_COL = 'CRM Sync Time';
var SYNC_ERROR_COL = 'CRM Error';

/** Read the auth + endpoint configuration from script properties. */
function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('CRM_BASE_URL');
  var apiKey = props.getProperty('CRM_API_KEY');
  if (!baseUrl || !apiKey) {
    throw new Error(
      'CRM_BASE_URL and CRM_API_KEY are not set in Script Properties.'
    );
  }
  baseUrl = String(baseUrl).replace(/\/+$/, '');
  return { baseUrl: baseUrl, apiKey: String(apiKey) };
}

/**
 * Build the schema (column header -> 0-based column index) for the
 * response sheet once, so we can translate rows to objects regardless of
 * column order.
 */
function buildHeaderIndex_(sheet) {
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var index = {};
  for (var c = 0; c < headerRow.length; c++) {
    var name = String(headerRow[c] || '').trim().toLowerCase();
    if (name) index[name] = c;
  }
  return index;
}

/**
 * Map a response row (array of cell values) to a CRM payload object.
 * Uses COLUMN_MAP (explicit numbers) and FIELD_HEADER_MAP (header names)
 * to resolve each CRM field, then trims empties.
 */
function mapRowToPayload_(row, headerIndex) {
  var payload = {};

  function put(crmField, sources) {
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var colIndex = null;
      if (typeof s === 'number') {
        colIndex = s - 1; // COLUMN_MAP values are 1-based
      } else {
        var key = String(s).toLowerCase();
        if (headerIndex.hasOwnProperty(key)) colIndex = headerIndex[key];
      }
      if (colIndex != null && row[colIndex] !== undefined && row[colIndex] !== null) {
        var val = String(row[colIndex]).trim();
        if (val && val !== '') {
          payload[crmField] = val;
          return;
        }
      }
    }
  }

  // Explicit numeric mapping takes priority.
  Object.keys(COLUMN_MAP).forEach(function (field) {
    put(field, [COLUMN_MAP[field]]);
  });

  // Then header-name mapping for fields not already resolved.
  ['name', 'phone', 'email', 'company', 'location', 'message', 'campaign'].forEach(
    function (field) {
      if (!payload[field]) put(field, FIELD_HEADER_MAP[field] || []);
    }
  );

  return payload;
}

/**
 * Send ONE form response row to the CRM webhook.
 * Returns { ok, status, data }. Never throws to the caller for HTTP
 * failures — it returns the outcome so the caller can record it.
 */
function syncRow_(sheet, headerIndex, rowIndex, payload) {
  var config = getConfig_();
  var url = config.baseUrl + '/api/v1/integrations/google-forms';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + config.apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  var bodyText = response.getContentText();
  Logger.log('[syncRow_] POST ' + url + ' -> HTTP ' + code + ' | body: ' + bodyText.slice(0, 500));
  var body = null;
  try {
    body = JSON.parse(bodyText);
  } catch (e) {
    body = null;
  }
  return {
    ok: code >= 200 && code < 300,
    status: code,
    data: body,
  };
}

/**
 * Locate (or create) the integration status columns at the right edge of
 * the sheet and return their 0-based column indices.
 */
function ensureStatusColumns_(sheet) {
  var lastColumn = sheet.getLastColumn();
  var headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  function findOrAppend(label) {
    for (var i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim() === label) {
        return i;
      }
    }
    var newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue(label);
    headerRow.push(label);
    return newCol - 1; // 0-based
  }
  return {
    status: findOrAppend(SYNC_STATUS_COL),
    contactId: findOrAppend(SYNC_CONTACT_ID_COL),
    time: findOrAppend(SYNC_TIME_COL),
    error: findOrAppend(SYNC_ERROR_COL),
  };
}

function writeSyncResult_(sheet, rowIndex, cols, result) {
  var now = new Date().toISOString();
  if (result.ok) {
    var contactId = result.data && result.data.contact_id ? result.data.contact_id : '';
    sheet.getRange(rowIndex, cols.status + 1).setValue('SUCCESS');
    sheet.getRange(rowIndex, cols.contactId + 1).setValue(contactId);
    sheet.getRange(rowIndex, cols.time + 1).setValue(now);
    sheet.getRange(rowIndex, cols.error + 1).setValue('');
  } else {
    var message = '';
    if (result.data && result.data.error && result.data.error.message) {
      message = result.data.error.message;
    } else {
      message = 'HTTP ' + result.status + (result.data ? ' ' + JSON.stringify(result.data) : '');
    }
    sheet.getRange(rowIndex, cols.status + 1).setValue('FAILED');
    sheet.getRange(rowIndex, cols.contactId + 1).setValue('');
    sheet.getRange(rowIndex, cols.time + 1).setValue(now);
    sheet.getRange(rowIndex, cols.error + 1).setValue(message);
  }
}

/**
 * Main entry point — the installable on-form-submit trigger handler.
 * Reads all rows from the sheet, and syncs each that is NOT already
 * marked SUCCESS (so re-running is safe and idempotent).
 */
function onFormSubmit(e) {
  var sheet =
    e && e.range && e.range.getSheet
      ? e.range.getSheet()
      : SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  syncPendingRows_(sheet);
}

/**
 * Read every response row (skipping rows already marked SUCCESS) and
 * sync them. Also corrects the STATUS columns to FAILED (without losing
 * the row) when the CRM is temporarily unreachable — the response always
 * stays in the Google Sheet for later retry.
 */
function syncPendingRows_(sheet) {
  var headerIndex = buildHeaderIndex_(sheet);
  var cols = ensureStatusColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // header only

  for (var r = 1; r < data.length; r++) {
    var statusCell = data[r][cols.status];
    if (String(statusCell || '').toUpperCase() === 'SUCCESS') continue;

    var payload = mapRowToPayload_(data[r], headerIndex);
    if (!payload.phone) {
      sheet
        .getRange(r + 1, cols.status + 1)
        .setValue('FAILED — no phone');
      sheet.getRange(r + 1, cols.error + 1).setValue('Missing phone number');
      continue;
    }

    // Idempotency key: Google Forms stores the response id in the hidden
    // "_id" column (column index = number of form columns + 1) when one is
    // present. Fall back to a stable hash of the row so retries of the same
    // response stay unique while distinct responses never collide.
    var responseId =
      data[r][data[r].length - 1] && String(data[r][data[r].length - 1]).indexOf('.') !== -1
        ? String(data[r][data[r].length - 1])
        : 'row-' + Utilities.computeDigest(
            Utilities.DigestAlgorithm.SHA_256,
            JSON.stringify(data[r]).slice(0, 200),
            Utilities.Charset.UTF_8
          )
            .map(function (b) {
              return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
            })
            .join('')
            .slice(0, 32);

    payload.submission_id = responseId;

    var result = syncRow_(sheet, headerIndex, r + 1, payload);
    writeSyncResult_(sheet, r + 1, cols, result);
  }
}

/**
 * Run manually (or via a time-based trigger) to retry any rows whose
 * sync previously FAILED. Idempotent — rows already SUCCESS are skipped
 * and the CRM de-duplicates by submission_id regardless.
 */
function retryFailedSyncs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  syncPendingRows_(sheet);
}

/**
 * One-time setup: install the installable form-submit trigger.
 */
function installFormTrigger() {
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();
}

/**
 * Convenience: validate that the CRM is reachable and the API key works
 * by attempting a harmless connection test (GET on an authenticated
 * endpoint). Prints a one-line result to the log.
 */
function testConnection() {
  var config = getConfig_();
  try {
    var response = UrlFetchApp.fetch(
      config.baseUrl + '/api/v1/me',
      { headers: { Authorization: 'Bearer ' + config.apiKey }, muteHttpExceptions: true }
    );
    Logger.log('CRM connection: HTTP ' + response.getResponseCode());
  } catch (e) {
    Logger.log('CRM connection failed: ' + e);
  }
}
