/* SDP Agile WorkBoard v255 — shared state & configuration */
let tickets = [];
let selectedTicketId = null;
let drawerReturnTo = null; // Drawer, bir Epic/Sprint Detay penceresinin içinden açıldıysa kapanınca oraya geri dönülsün diye
let epicDetailReturnAfterIssue = null; // "Bu Epic'e İş Ekle" sonrası hangi Epic Detay'a geri dönülecek
let activeTab = "dashboard";
let lastDataRefreshAt = null; // SDP verisinin bu Space için en son başarıyla yüklendiği an
let boardColumns = [];
let assignees = [];
let priorities = [];
let sprints = [];
let epics = [];
let spaces = [];
let currentSpace = null;
let isManager = false;
let usingRealData = false;
let isPollingStarted = false;
let isDragging = false;
let currentUser = null;
let drawerDraft = {};
let currentTicketTasks = [];
let taskLocalHistory = {};
const ticketUdfCache = new Map(); // id -> { lastUpdatedTimeMs, sprintId, epicId, spaceId, workItemType }

const APP_VERSION = "v255"; // Her deploy'da güncelle — kullanıcı destek isterken "hangi versiyonu görüyorsun" diye sorabiliriz, eski cache'i hemen fark ederiz

let CONFIG = {
  SETTINGS_MODULE_PLURAL: "cm_widget_settings", // Doğrulandı — kullanıcı tarafından teyit edildi
  MODULE_SPACES: "cm_spaces",
  MODULE_SPACES_SINGULAR: "cm_space",
  MODULE_SPRINTS: "cm_sprints",
  MODULE_SPRINTS_SINGULAR: "cm_sprint",
  MODULE_EPICS: "cm_epics",
  MODULE_EPICS_SINGULAR: "cm_epic",
  AGILE_TEMPLATE_NAME: "SDP Agile Board Template",
  SETTINGS_DESCRIPTION_FIELD_KEY: "description",
  SPACE_KEY_FIELD_KEY: "key",
  SPACE_OWNER_FIELD_KEY: "sahip", // Kimlik fallback alanı
  SPACE_DESCRIPTION_FIELD_KEY: "description",
  SPACE_ASSIGNEE_FIELD_KEY: "assignee",
  EPIC_DESCRIPTION_FIELD_KEY: "description",
  EPIC_STATUS_FIELD_KEY: "status",
  EPIC_SPACE_ID_FIELD_KEY: "space_id",
  EPIC_ASSIGNEE_FIELD_KEY: "assignee",
  SPRINT_GOAL_FIELD_KEY: "goal",
  SPRINT_START_DATE_FIELD_KEY: "start_date",
  SPRINT_END_DATE_FIELD_KEY: "end_date",
  SPRINT_ACTUAL_START_FIELD_KEY: "actual_start_date",
  SPRINT_ACTUAL_END_FIELD_KEY: "actual_end_date",
  SPRINT_CLOSURE_SUMMARY_FIELD_KEY: "closure_summary",
  SPRINT_STATUS_FIELD_KEY: "status",
  SPRINT_RESOLUTION_FIELD_KEY: "resolution",
  SPRINT_SPACE_ID_FIELD_KEY: "space_id",
  WORK_ITEM_TYPE_FIELD_KEY: "udf_pick_926",
  SPRINT_ID_FIELD_KEY: "udf_sline_914",
  EPIC_ID_FIELD_KEY: "udf_sline_927",
  SPACE_ID_FIELD_KEY: "udf_sline_976",
};

function deriveLegacySingularApiName(pluralName) {
  const name = String(pluralName || "");
  return name.endsWith("s") ? name.slice(0, -1) : name;
}

CONFIG.SETTINGS_MODULE_SINGULAR = "cm_widget_setting"; // bootstrap standardı sabit
// Varsayılan config için tekil değerler zaten açıkça tanımlı; eski kayıtlar yüklenirken ayrıca ele alınır.

function logTaskChange(taskId, message) {
  if (!taskLocalHistory[taskId]) taskLocalHistory[taskId] = [];
  const who = currentUser?.name || "Sen";
  const when = new Date().toLocaleString("tr-TR");
  taskLocalHistory[taskId].unshift(`${message} — ${who}, ${when}`);
}

const THEME_KEY = "sdp_agile_work_board_theme";
const WORK_ITEM_TYPES = ["Story", "Task", "Bug"];
const KNOWN_PRIORITIES = ["Low", "Normal", "Medium", "High"];

const STATUS_MAP = {
  "1": { id: "1", name: "Closed", internal_name: "Closed", color: "#006600" },
  "2": { id: "2", name: "Open", internal_name: "Open", color: "#0066ff" },
  "3": { id: "3", name: "Onhold", internal_name: "Onhold", color: "#ff0000" },
  "4": { id: "4", name: "Resolved", internal_name: "Resolved", color: "#00ff66" },
  "5": { id: "5", name: "Assigned", internal_name: "Assigned", color: "#006699" },
  "6": { id: "6", name: "In Progress", internal_name: "In Progress", color: "#00ffcc" },
  "7": { id: "7", name: "Cancelled", internal_name: "Cancelled", color: "" }
};

const DEFAULT_COLUMNS = [
  { id: "2", title: "Open", color: "#0066ff" },
  { id: "5", title: "Assigned", color: "#006699" },
  { id: "6", title: "In Progress", color: "#00ffcc" },
  { id: "3", title: "Onhold", color: "#ff0000" },
  { id: "4", title: "Resolved", color: "#00ff66" },
  { id: "1", title: "Closed", color: "#006600" }
];

