import { AnimatePresence, motion } from "framer-motion";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CellValue } from "exceljs";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { App as CapacitorApp } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import domtoimage from "dom-to-image-more";
import { PDFDocument } from "pdf-lib";

type Person = {
  id: string;
  name: string;
  phone: string;
  note: string;
  createdAt: string;
};

type EntryType = "debt" | "payment";
type CurrencyCode = "SYP" | "USD";

type Entry = {
  id: string;
  personId: string;
  type: EntryType;
  amount: number;
  currency: CurrencyCode;
  description: string;
  productId?: string;
  quantity?: number;
  unitPrice?: number;
  date: string;
  createdAt: string;
};

type Product = {
  id: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
};

type StockMovement = {
  id: string;
  productId: string;
  type: "add" | "subtract" | "manual";
  quantity: number;
  date: string;
  note: string;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  personId: string;
  entryIds: string[];
  paidAmount: number;
  paidCurrency: CurrencyCode;
  remainingByCurrency: Record<CurrencyCode, number>;
  createdAt: string;
};

type UserRole = "admin" | "employee";

type AppUser = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
};

type Reminder = {
  id: string;
  personId: string;
  entryId: string | null;
  note: string;
  amount: number;
  dueAt: string;
  createdAt: string;
  notifiedAt: string | null;
  notificationId: number | null;
};

type AppSetting = {
  key: "currency";
  value: CurrencyCode;
};

type Tab = "overview" | "people" | "transactions" | "reports" | "reminders" | "inventory";
type BalanceMap = Record<CurrencyCode, number>;

const ZERO_BALANCE: BalanceMap = { SYP: 0, USD: 0 };
const BASE_DIR = "Download/Aldyon";
const BACKUPS_DIR = `${BASE_DIR}/backups`;
const REPORTS_DIR = `${BASE_DIR}/reports`;
const INVOICES_DIR = `${BASE_DIR}/invoices`;
const EXPORTS_DIR = `${BASE_DIR}/exports`;

const DB_NAME = "yam-debt-db";
const DB_VERSION = 4;
const SETTINGS_STORE = "app_settings";

const CURRENCY_META: Record<CurrencyCode, { label: string; symbol: string; locale: string }> = {
  SYP: { label: "ليرة سورية (ل.س)", symbol: "ل.س", locale: "ar-SY" },
  USD: { label: "دولار أمريكي ($)", symbol: "$", locale: "en-US" },
};

const dateFormatter = new Intl.DateTimeFormat("ar", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ar", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const todayIso = () => new Date().toISOString().slice(0, 10);

const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const formatMoney = (amount: number, currency: CurrencyCode) => {
  const meta = CURRENCY_META[currency];
  const hasFraction = !Number.isInteger(amount);
  const formatter = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return currency === "USD" ? `${meta.symbol}${formatter.format(amount)}` : `${formatter.format(amount)} ${meta.symbol}`;
};

const normalizeAmount = (value: number) => Number(value.toFixed(2));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("persons")) {
        db.createObjectStore("persons", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("personId", "personId", { unique: false });
      }
      if (!db.objectStoreNames.contains("reminders")) {
        const store = db.createObjectStore("reminders", { keyPath: "id" });
        store.createIndex("personId", "personId", { unique: false });
        store.createIndex("entryId", "entryId", { unique: false });
        store.createIndex("dueAt", "dueAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("stock_movements")) {
        const store = db.createObjectStore("stock_movements", { keyPath: "id" });
        store.createIndex("productId", "productId", { unique: false });
      }
      if (!db.objectStoreNames.contains("invoices")) {
        db.createObjectStore("invoices", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("users")) {
        db.createObjectStore("users", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllData(): Promise<{
  people: Person[];
  entries: Entry[];
  reminders: Reminder[];
  products: Product[];
  stockMovements: StockMovement[];
  invoices: Invoice[];
  users: AppUser[];
  currency: CurrencyCode;
}> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["persons", "entries", "reminders", "products", "stock_movements", "invoices", "users", SETTINGS_STORE],
      "readonly"
    );
    const peopleReq = tx.objectStore("persons").getAll();
    const entriesReq = tx.objectStore("entries").getAll();
    const remindersReq = tx.objectStore("reminders").getAll();
    const productsReq = tx.objectStore("products").getAll();
    const movementsReq = tx.objectStore("stock_movements").getAll();
    const invoicesReq = tx.objectStore("invoices").getAll();
    const usersReq = tx.objectStore("users").getAll();
    const currencyReq = tx.objectStore(SETTINGS_STORE).get("currency");

    tx.oncomplete = () => {
      resolve({
        people: (peopleReq.result ?? []) as Person[],
        entries: ((entriesReq.result ?? []) as Entry[]).map((entry) => ({ ...entry, currency: entry.currency ?? "SYP" })),
        reminders: (remindersReq.result ?? []) as Reminder[],
        products: (productsReq.result ?? []) as Product[],
        stockMovements: (movementsReq.result ?? []) as StockMovement[],
        invoices: (invoicesReq.result ?? []) as Invoice[],
        users: (usersReq.result ?? []) as AppUser[],
        currency: (currencyReq.result as AppSetting | undefined)?.value ?? "SYP",
      });
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

async function putRecord(store: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function saveCurrencySetting(currency: CurrencyCode): Promise<void> {
  await putRecord(SETTINGS_STORE, { key: "currency", value: currency } as AppSetting);
}

async function deleteEntryCascade(entryId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["entries", "reminders"], "readwrite");
    tx.objectStore("entries").delete(entryId);
    const reminderStore = tx.objectStore("reminders");
    const index = reminderStore.index("entryId");
    index.openCursor(IDBKeyRange.only(entryId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        reminderStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deletePersonCascade(personId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["persons", "entries", "reminders"], "readwrite");
    tx.objectStore("persons").delete(personId);

    const entriesStore = tx.objectStore("entries");
    const entriesIndex = entriesStore.index("personId");
    entriesIndex.openCursor(IDBKeyRange.only(personId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        entriesStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    const remindersStore = tx.objectStore("reminders");
    const remindersIndex = remindersStore.index("personId");
    remindersIndex.openCursor(IDBKeyRange.only(personId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        remindersStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function replaceAllData(
  people: Person[],
  entries: Entry[],
  reminders: Reminder[],
  currency: CurrencyCode
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["persons", "entries", "reminders", SETTINGS_STORE], "readwrite");
    const peopleStore = tx.objectStore("persons");
    const entriesStore = tx.objectStore("entries");
    const remindersStore = tx.objectStore("reminders");
    const settingsStore = tx.objectStore(SETTINGS_STORE);

    peopleStore.clear();
    entriesStore.clear();
    remindersStore.clear();
    settingsStore.clear();

    people.forEach((person) => peopleStore.put(person));
    entries.forEach((entry) => entriesStore.put(entry));
    reminders.forEach((reminder) => remindersStore.put(reminder));
    settingsStore.put({ key: "currency", value: currency } as AppSetting);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return "";
}

function cellToNumber(value: CellValue): number {
  if (typeof value === "number") {
    return normalizeAmount(value);
  }
  const parsed = Number(cellToString(value));
  return Number.isFinite(parsed) ? normalizeAmount(parsed) : 0;
}

function getHeaderMap(row: { getCell: (index: number) => { value: CellValue }; cellCount: number }) {
  const map = new Map<string, number>();
  for (let i = 1; i <= row.cellCount; i += 1) {
    const key = cellToString(row.getCell(i).value).trim().toLowerCase();
    if (key) {
      map.set(key, i);
    }
  }
  return map;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  const encoded = new TextEncoder().encode(text);
  return toBase64(encoded.buffer);
}

function isNativeApp() {
  return Capacitor.getPlatform() !== "web";
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userForm, setUserForm] = useState({ name: "", role: "employee" as UserRole });
  const [currency, setCurrency] = useState<CurrencyCode>("SYP");
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [personSearch, setPersonSearch] = useState("");
  const [personFilter, setPersonFilter] = useState<"all" | "debt" | "settled">("all");
  const [entrySearch, setEntrySearch] = useState("");
  const [entryFilter, setEntryFilter] = useState<"all" | EntryType>("all");

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [showPersonForm, setShowPersonForm] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personForm, setPersonForm] = useState({
    name: "",
    phone: "",
    note: "",
    openingAmount: "",
    openingCurrency: "SYP" as CurrencyCode,
  });

  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({
    personId: "",
    type: "debt" as EntryType,
    currency: "SYP" as CurrencyCode,
    amount: "",
    description: "",
    productId: "",
    quantity: "1",
    unitPrice: "",
    date: todayIso(),
    addReminder: false,
    reminderDate: todayIso(),
    reminderTime: "",
    reminderText: "",
  });

  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderForm, setReminderForm] = useState({
    personId: "",
    dueDate: todayIso(),
    dueTime: "",
    note: "",
  });

  const [statusMessage, setStatusMessage] = useState("");
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  const [dueAlerts, setDueAlerts] = useState<Reminder[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: "", quantity: "0", lowStockThreshold: "5" });
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productRange, setProductRange] = useState({ from: "", to: "" });
  const [shopSettings, setShopSettings] = useState({ shopName: "", cashierName: "", cashierPhone: "" });
  const [stockErrorMessage, setStockErrorMessage] = useState("");

  const currentUser = users.find((user) => user.id === currentUserId) ?? null;
  const isAdmin = currentUser?.role !== "employee";

  const longPressTimer = useRef<number | null>(null);
  const accountReportRef = useRef<HTMLDivElement | null>(null);
  const formatCurrency = (amount: number) => formatMoney(amount, currency);

  const personBalanceMap = useMemo(() => {
    const map = new Map<string, BalanceMap>();
    people.forEach((person) => map.set(person.id, { ...ZERO_BALANCE }));
    entries.forEach((entry) => {
      const current = map.get(entry.personId) ?? { ...ZERO_BALANCE };
      const nextValue =
        entry.type === "debt"
          ? current[entry.currency] + entry.amount
          : current[entry.currency] - entry.amount;
      map.set(entry.personId, {
        ...current,
        [entry.currency]: normalizeAmount(nextValue),
      });
    });
    return map;
  }, [people, entries]);

  const balanceToLines = (balance: BalanceMap) => {
    return (Object.keys(CURRENCY_META) as CurrencyCode[])
      .map((code) => ({ code, value: normalizeAmount(balance[code] ?? 0) }))
      .filter((item) => item.value !== 0);
  };

  const formatBalanceMap = (balance: BalanceMap) => {
    const lines = balanceToLines(balance).map((item) => formatMoney(item.value, item.code));
    return lines.length ? lines.join(" | ") : formatMoney(0, "SYP");
  };

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  const selectedPersonEntries = useMemo(() => {
    if (!selectedPersonId) {
      return [];
    }
    return entries.filter((entry) => entry.personId === selectedPersonId).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, selectedPersonId]);

  const lowStockCount = useMemo(
    () => products.filter((item) => item.quantity < item.lowStockThreshold).length,
    [products]
  );

  const paymentPreview = useMemo(() => {
    if (entryForm.type !== "payment" || !entryForm.personId) {
      return null;
    }
    const personEntries = entries.filter((item) => item.personId === entryForm.personId && item.currency === entryForm.currency);
    const totalDebt = personEntries.filter((item) => item.type === "debt").reduce((sum, item) => sum + item.amount, 0);
    const totalPaid = personEntries.filter((item) => item.type === "payment").reduce((sum, item) => sum + item.amount, 0);
    const current = Number(entryForm.amount || "0");
    const remaining = normalizeAmount(totalDebt - totalPaid);
    const after = normalizeAmount(remaining - current);
    return {
      totalDebt: normalizeAmount(totalDebt),
      totalPaid: normalizeAmount(totalPaid),
      remaining,
      current: normalizeAmount(current),
      after,
    };
  }, [entryForm, entries]);

  const filteredPeople = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    return people
      .filter((person) => {
        if (!query) {
          return true;
        }
        return person.name.toLowerCase().includes(query) || person.phone.toLowerCase().includes(query);
      })
      .filter((person) => {
        const balance = personBalanceMap.get(person.id) ?? 0;
        const current = typeof balance === "number" ? { ...ZERO_BALANCE } : balance;
        const hasDebt = (Object.keys(CURRENCY_META) as CurrencyCode[]).some((code) => current[code] > 0);
        const isSettled = (Object.keys(CURRENCY_META) as CurrencyCode[]).every((code) => current[code] <= 0);
        if (personFilter === "debt") {
          return hasDebt;
        }
        if (personFilter === "settled") {
          return isSettled;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [people, personSearch, personFilter, personBalanceMap]);

  const filteredEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    return entries
      .filter((entry) => (entryFilter === "all" ? true : entry.type === entryFilter))
      .filter((entry) => {
        if (!query) {
          return true;
        }
        const personName = people.find((person) => person.id === entry.personId)?.name ?? "";
        return (
          personName.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query) ||
          entry.amount.toString().includes(query)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, entryFilter, entrySearch, people]);

  const totals = useMemo(() => {
    const totalDebt: BalanceMap = { ...ZERO_BALANCE };
    const totalPayments: BalanceMap = { ...ZERO_BALANCE };
    const dueNow: BalanceMap = { ...ZERO_BALANCE };
    const monthKey = new Date().toISOString().slice(0, 7);
    const newDebts: BalanceMap = { ...ZERO_BALANCE };

    entries.forEach((entry) => {
      if (entry.type === "debt") {
        totalDebt[entry.currency] = normalizeAmount(totalDebt[entry.currency] + entry.amount);
        if (entry.date.startsWith(monthKey)) {
          newDebts[entry.currency] = normalizeAmount(newDebts[entry.currency] + entry.amount);
        }
      } else {
        totalPayments[entry.currency] = normalizeAmount(totalPayments[entry.currency] + entry.amount);
      }
    });

    Array.from(personBalanceMap.values()).forEach((balance) => {
      (Object.keys(CURRENCY_META) as CurrencyCode[]).forEach((code) => {
        dueNow[code] = normalizeAmount(dueNow[code] + Math.max(0, balance[code] ?? 0));
      });
    });

    return {
      totalDebt,
      totalPayments,
      dueNow,
      newDebts,
      peopleCount: people.length,
    };
  }, [entries, people.length, personBalanceMap]);

  const monthlyReport = useMemo(() => {
    const map = new Map<string, { debt: number; payment: number }>();
    entries.forEach((entry) => {
      const key = entry.date.slice(0, 7);
      const current = map.get(key) ?? { debt: 0, payment: 0 };
      if (entry.type === "debt") {
        current.debt += entry.amount;
      } else {
        current.payment += entry.amount;
      }
      map.set(key, { debt: normalizeAmount(current.debt), payment: normalizeAmount(current.payment) });
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [entries]);

  const maxMonthValue = useMemo(() => {
    return monthlyReport.reduce((max, [, item]) => Math.max(max, item.debt, item.payment), 1);
  }, [monthlyReport]);

  const sortedReminders = useMemo(() => {
    return [...reminders].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }, [reminders]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) {
      return products;
    }
    return products.filter((item) => item.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const selectedProductMovements = useMemo(() => {
    if (!selectedProductId) {
      return [];
    }
    return stockMovements
      .filter((item) => item.productId === selectedProductId)
      .filter((item) => {
        if (productRange.from && item.date.slice(0, 10) < productRange.from) {
          return false;
        }
        if (productRange.to && item.date.slice(0, 10) > productRange.to) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [stockMovements, selectedProductId, productRange]);

  useEffect(() => {
    void refreshData();
    void loadShopSettings();
    void requestStartupPermissions();
  }, []);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }
    const timer = window.setTimeout(() => setStatusMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void checkDueReminders();
      void checkSmartAlerts();
    }, 30000);
    void ensureNotificationPermissions();
    void checkDueReminders();
    void checkSmartAlerts();
    return () => window.clearInterval(timer);
  }, [reminders]);

  useEffect(() => {
    void runAutoBackupIfNeeded();
  }, [people.length, entries.length, reminders.length]);

  async function refreshData() {
    setLoading(true);
    try {
      const data = await getAllData();
      setPeople(data.people);
      setEntries(data.entries);
      setProducts(data.products);
      setStockMovements(data.stockMovements);
      setInvoices(data.invoices);
      setUsers(data.users);
      if (!currentUserId && data.users[0]) {
        setCurrentUserId(data.users[0].id);
      }
      setReminders(
        data.reminders.map((item) => ({
          ...item,
          amount: Number(item.amount ?? 0),
          notificationId: item.notificationId ?? null,
        }))
      );
      setCurrency(data.currency);
      if (selectedPersonId && !data.people.some((person) => person.id === selectedPersonId)) {
        setSelectedPersonId(null);
      }
    } catch {
      setStatusMessage("تعذر تحميل البيانات المحلية.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDueReminders() {
    const now = new Date();
    const due = reminders.filter((item) => new Date(item.dueAt) <= now && !item.notifiedAt);
    if (!due.length) {
      return;
    }

    for (const reminder of due) {
      await putRecord("reminders", { ...reminder, notifiedAt: new Date().toISOString() });
    }

    setDueAlerts(due);
    await refreshData();
  }

  async function checkSmartAlerts() {
    const now = Date.now();
    const upcoming = reminders.find((item) => {
      const diff = new Date(item.dueAt).getTime() - now;
      return diff > 0 && diff <= 60 * 60 * 1000;
    });
    if (upcoming) {
      setStatusMessage(`تذكير قريب: ${upcoming.note}`);
    }

    const debtLimitPerson = people.find((person) => {
      const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
      return balance.SYP > 100000;
    });

    if (debtLimitPerson) {
      setStatusMessage(`تنبيه: ${debtLimitPerson.name} تجاوز حد الدين 100000 ل.س`);
    }
  }

  async function ensureStoragePermissions() {
    if (!isNativeApp()) {
      return;
    }
    const current = await Filesystem.checkPermissions();
    if (current.publicStorage !== "granted") {
      await Filesystem.requestPermissions();
    }
  }

  async function ensureNotificationPermissions() {
    if (!isNativeApp()) {
      return;
    }
    const current = await LocalNotifications.checkPermissions();
    if (current.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
  }

  async function ensureAldyonFolders() {
    if (!isNativeApp()) {
      return;
    }
    const folders = [BASE_DIR, BACKUPS_DIR, REPORTS_DIR, INVOICES_DIR, EXPORTS_DIR];
    for (const folder of folders) {
      try {
        await Filesystem.mkdir({ path: folder, directory: Directory.ExternalStorage, recursive: true });
      } catch {
        // Folder may already exist.
      }
    }
  }

  async function requestStartupPermissions() {
    if (!isNativeApp()) {
      return;
    }
    if (localStorage.getItem("dayooni_permissions_requested") === "1") {
      return;
    }
    try {
      await ensureStoragePermissions();
      await ensureNotificationPermissions();
      await ensureAldyonFolders();
      localStorage.setItem("dayooni_permissions_requested", "1");
    } catch {
      setStatusMessage("تعذر طلب الصلاحيات عند التشغيل الأول.");
    }
  }

  function openAddPerson() {
    setEditingPersonId(null);
    setPersonForm({ name: "", phone: "", note: "", openingAmount: "", openingCurrency: "SYP" });
    setShowPersonForm(true);
  }

  function openEditPerson(person: Person) {
    setEditingPersonId(person.id);
    setPersonForm({
      name: person.name,
      phone: person.phone,
      note: person.note,
      openingAmount: "",
      openingCurrency: "SYP",
    });
    setShowPersonForm(true);
  }

  async function handleSubmitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personForm.name.trim()) {
      setStatusMessage("الاسم مطلوب.");
      return;
    }

    const edited = people.find((person) => person.id === editingPersonId);
    const nextPerson: Person = {
      id: editingPersonId ?? uid(),
      name: personForm.name.trim(),
      phone: personForm.phone.trim(),
      note: personForm.note.trim(),
      createdAt: edited?.createdAt ?? new Date().toISOString(),
    };

    await putRecord("persons", nextPerson);
    if (!editingPersonId && Number(personForm.openingAmount || "0") > 0) {
      await putRecord("entries", {
        id: uid(),
        personId: nextPerson.id,
        type: "debt",
        amount: normalizeAmount(Number(personForm.openingAmount)),
        currency: personForm.openingCurrency,
        description: "رصيد افتتاحي",
        date: todayIso(),
        createdAt: new Date().toISOString(),
      } as Entry);
    }
    await refreshData();
    setShowPersonForm(false);
    setStatusMessage(editingPersonId ? "تم تحديث بيانات الشخص." : "تمت إضافة الشخص.");
  }

  function openAddEntry(personId?: string) {
    setEditingEntryId(null);
    setEntryForm({
      personId: personId ?? selectedPersonId ?? people[0]?.id ?? "",
      type: "debt",
      currency,
      amount: "",
      description: "",
      productId: "",
      quantity: "1",
      unitPrice: "",
      date: todayIso(),
      addReminder: false,
      reminderDate: todayIso(),
      reminderTime: "",
      reminderText: "",
    });
    setShowEntryForm(true);
  }

  function openEditEntry(entry: Entry) {
    setEditingEntryId(entry.id);
    setEntryForm({
      personId: entry.personId,
      type: entry.type,
      currency: entry.currency,
      amount: String(entry.amount),
      description: entry.description,
      productId: entry.productId ?? "",
      quantity: entry.quantity ? String(entry.quantity) : "1",
      unitPrice: entry.unitPrice ? String(entry.unitPrice) : "",
      date: entry.date,
      addReminder: false,
      reminderDate: todayIso(),
      reminderTime: "",
      reminderText: "",
    });
    setShowEntryForm(true);
  }

  async function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = normalizeAmount(Number(entryForm.amount));

    if (!entryForm.personId) {
      setStatusMessage("يرجى اختيار الشخص.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage("المبلغ يجب أن يكون أكبر من صفر.");
      return;
    }

    if (entryForm.type === "debt" && entryForm.productId) {
      const selectedProduct = products.find((item) => item.id === entryForm.productId);
      const requested = Number(entryForm.quantity || "0");
      const available = selectedProduct?.quantity ?? 0;
      if (!selectedProduct) {
        setStatusMessage("البضاعة المحددة غير موجودة.");
        return;
      }
      if (!Number.isFinite(requested) || requested <= 0) {
        setStatusMessage("يرجى إدخال كمية صحيحة.");
        return;
      }
      if (requested > available && !editingEntryId) {
        setStockErrorMessage(`⚠️ الكمية غير كافية!\nالمتوفر في المستودع: ${available}\nالكمية المطلوبة: ${requested}`);
        return;
      }
    }

    const existing = entries.find((entry) => entry.id === editingEntryId);
    const entryRecord: Entry = {
      id: editingEntryId ?? uid(),
      personId: entryForm.personId,
      type: entryForm.type,
      amount,
      currency: entryForm.currency,
      description: entryForm.description.trim(),
      productId: entryForm.productId || undefined,
      quantity: entryForm.productId ? Number(entryForm.quantity || "1") : undefined,
      unitPrice: entryForm.productId ? Number(entryForm.unitPrice || "0") : undefined,
      date: entryForm.date,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await putRecord("entries", entryRecord);

    if (!editingEntryId && entryRecord.type === "debt" && entryRecord.productId) {
      const product = products.find((item) => item.id === entryRecord.productId);
      if (product) {
        const qty = Number(entryRecord.quantity ?? 0);
        const nextQty = Math.max(0, normalizeAmount(product.quantity - qty));
        await putRecord("products", { ...product, quantity: nextQty, updatedAt: new Date().toISOString() });
        await putRecord("stock_movements", {
          id: uid(),
          productId: product.id,
          type: "subtract",
          quantity: qty,
          date: new Date().toISOString(),
          note: `بيع بالدين: ${entryRecord.description}`,
        } as StockMovement);
      }
    }

    if (!editingEntryId && entryForm.type === "debt" && entryForm.addReminder) {
      const dueAt = `${entryForm.reminderDate}T${entryForm.reminderTime || "09:00"}:00`;
      const personName = people.find((p) => p.id === entryForm.personId)?.name ?? "العميل";
      const reminderRecord: Reminder = {
        id: uid(),
        personId: entryForm.personId,
        entryId: entryRecord.id,
        note:
          entryForm.reminderText.trim() ||
          `مطالبة ${personName} بمبلغ ${formatMoney(amount, entryForm.currency)}`,
        amount,
        dueAt,
        createdAt: new Date().toISOString(),
        notifiedAt: null,
        notificationId: Date.now() % 2000000000,
      };
      await putRecord("reminders", reminderRecord);
      await scheduleReminderNotification(reminderRecord);
    }

    await refreshData();
    setShowEntryForm(false);
    setStatusMessage(editingEntryId ? "تم تعديل العملية." : "تم حفظ العملية.");
  }

  async function handleChangeCurrency(nextCurrency: CurrencyCode) {
    setCurrency(nextCurrency);
    await saveCurrencySetting(nextCurrency);
    setStatusMessage(`تم تغيير العملة إلى ${CURRENCY_META[nextCurrency].label}.`);
  }

  async function confirmDeletePerson() {
    if (!personToDelete) {
      return;
    }
    const related = reminders.filter((item) => item.personId === personToDelete.id);
    for (const reminder of related) {
      await cancelReminderNotification(reminder.notificationId);
    }
    await deletePersonCascade(personToDelete.id);
    setPersonToDelete(null);
    setSelectedPersonId(null);
    await refreshData();
    setActiveTab("people");
    setStatusMessage("تم حذف الشخص وجميع عملياته.");
  }

  async function confirmDeleteEntry() {
    if (!entryToDelete) {
      return;
    }
    const related = reminders.filter((item) => item.entryId === entryToDelete.id);
    for (const reminder of related) {
      await cancelReminderNotification(reminder.notificationId);
    }
    await deleteEntryCascade(entryToDelete.id);
    setEntryToDelete(null);
    await refreshData();
    setStatusMessage("تم حذف العملية.");
  }

  function openAddReminder() {
    setEditingReminderId(null);
    setReminderForm({ personId: selectedPersonId ?? people[0]?.id ?? "", dueDate: todayIso(), dueTime: "", note: "" });
    setShowReminderForm(true);
  }

  function openEditReminder(reminder: Reminder) {
    const due = new Date(reminder.dueAt);
    const date = due.toISOString().slice(0, 10);
    const time = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
    setEditingReminderId(reminder.id);
    setReminderForm({ personId: reminder.personId, dueDate: date, dueTime: time, note: reminder.note });
    setShowReminderForm(true);
  }

  async function handleSubmitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reminderForm.personId) {
      setStatusMessage("يرجى اختيار الشخص للتذكير.");
      return;
    }
    const base = reminders.find((item) => item.id === editingReminderId);
    if (base?.notificationId) {
      await cancelReminderNotification(base.notificationId);
    }
    const reminderRecord: Reminder = {
      id: editingReminderId ?? uid(),
      personId: reminderForm.personId,
      entryId: base?.entryId ?? null,
      note: reminderForm.note.trim() || "تذكير دين",
      amount: base?.amount ?? 0,
      dueAt: `${reminderForm.dueDate}T${reminderForm.dueTime || "09:00"}:00`,
      createdAt: base?.createdAt ?? new Date().toISOString(),
      notifiedAt: null,
      notificationId: base?.notificationId ?? Date.now() % 2000000000,
    };
    await putRecord("reminders", reminderRecord);
    await scheduleReminderNotification(reminderRecord);

    await refreshData();
    setShowReminderForm(false);
    setStatusMessage(editingReminderId ? "تم تعديل التذكير." : "تمت إضافة التذكير.");
  }

  async function confirmDeleteReminder() {
    if (!reminderToDelete) {
      return;
    }
    await cancelReminderNotification(reminderToDelete.notificationId);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("reminders", "readwrite");
      tx.objectStore("reminders").delete(reminderToDelete.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    setReminderToDelete(null);
    await refreshData();
    setStatusMessage("تم حذف التذكير.");
  }

  async function requestNotificationPermission() {
    if (!isNativeApp()) {
      setStatusMessage("الإشعارات المحلية تعمل داخل تطبيق أندرويد فقط.");
      return;
    }
    const result = await LocalNotifications.requestPermissions();
    setStatusMessage(result.display === "granted" ? "تم تفعيل الإشعارات." : "لم يتم منح إذن الإشعارات.");
  }

  async function scheduleReminderNotification(reminder: Reminder) {
    if (!isNativeApp() || reminder.notificationId === null) {
      return;
    }
    await ensureNotificationPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminder.notificationId,
          title: "تذكير دين",
          body: reminder.note,
          schedule: { at: new Date(reminder.dueAt), allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_launcher",
        },
      ],
    });
  }

  async function cancelReminderNotification(notificationId: number | null) {
    if (!isNativeApp() || notificationId === null) {
      return;
    }
    await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
  }

  async function saveWorkbookToDevice(buffer: ArrayBuffer, customName?: string, subDir = BACKUPS_DIR) {
    const dateTag = new Date().toISOString().slice(0, 10);
    const fileName = customName ?? `ديوني-backup-${dateTag}.xlsx`;

    if (!isNativeApp()) {
      setStatusMessage("حفظ ملفات Downloads متاح داخل APK فقط.");
      return null;
    }

    await ensureStoragePermissions();
    await ensureAldyonFolders();
    const result = await Filesystem.writeFile({
      path: `${subDir}/${fileName}`,
      directory: Directory.ExternalStorage,
      data: toBase64(buffer),
      recursive: true,
    });

    return result.uri;
  }

  async function buildBackupWorkbook() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const peopleSheet = workbook.addWorksheet("Persons");
    const entriesSheet = workbook.addWorksheet("Transactions");
    const remindersSheet = workbook.addWorksheet("Reminders");
    const summarySheet = workbook.addWorksheet("Summary");

    peopleSheet.addRow(["id", "name", "phone", "note", "createdAt", "balance", "currency", "balance_display"]);
    people.forEach((person) => {
      const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
      peopleSheet.addRow([
        person.id,
        person.name,
        person.phone,
        person.note,
        person.createdAt,
        JSON.stringify(balance),
        currency,
        formatBalanceMap(balance),
      ]);
    });

    entriesSheet.addRow([
      "id",
      "personId",
      "type",
      "amount",
      "currency",
      "amount_display",
      "description",
      "date",
      "createdAt",
    ]);
    entries.forEach((entry) => {
      entriesSheet.addRow([
        entry.id,
        entry.personId,
        entry.type,
        entry.amount,
        entry.currency,
        formatMoney(entry.amount, entry.currency),
        entry.description,
        entry.date,
        entry.createdAt,
      ]);
    });

    remindersSheet.addRow(["id", "personId", "entryId", "note", "amount", "dueAt", "createdAt", "notifiedAt", "notificationId"]);
    reminders.forEach((item) => {
      remindersSheet.addRow([
        item.id,
        item.personId,
        item.entryId ?? "",
        item.note,
        item.amount,
        item.dueAt,
        item.createdAt,
        item.notifiedAt ?? "",
        item.notificationId ?? "",
      ]);
    });

    summarySheet.addRow(["metric", "value"]);
    summarySheet.addRow(["dueNow", JSON.stringify(totals.dueNow)]);
    summarySheet.addRow(["totalDebt", JSON.stringify(totals.totalDebt)]);
    summarySheet.addRow(["totalPayments", JSON.stringify(totals.totalPayments)]);
    summarySheet.addRow(["peopleCount", totals.peopleCount]);
    summarySheet.addRow(["newDebts", JSON.stringify(totals.newDebts)]);
    summarySheet.addRow(["selectedCurrency", currency]);
    summarySheet.addRow(["dueNowDisplay", formatBalanceMap(totals.dueNow)]);

    return workbook;
  }

  async function exportExcel(customName?: string): Promise<string | null> {
    const workbook = await buildBackupWorkbook();

    const buffer = await workbook.xlsx.writeBuffer();
    const path = await saveWorkbookToDevice(buffer as ArrayBuffer, customName, BACKUPS_DIR);
    if (path) {
      setStatusMessage(`تم الحفظ في: ${path}`);
    }
    return path;
  }

  async function exportPdfReport() {
    try {
      const reportLines = [
        `تقرير شامل - ${todayIso()}`,
        "━━━━━━━━━━━━━━━━━━━",
        "الأشخاص:",
        ...people.map((person) => {
          const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
          return `- ${person.name}: ${formatBalanceMap(balance)}`;
        }),
        "━━━━━━━━━━━━━━━━━━━",
        "العمليات:",
        ...entries.slice(-100).map((entry) => {
          return `- ${entry.date} | ${entry.type} | ${formatMoney(entry.amount, entry.currency)} | ${entry.description || "-"}`;
        }),
      ];
      const text = reportLines.join("\n");
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      page.drawText(text, { x: 24, y: 800, size: 11, lineHeight: 14, maxWidth: 550 });
      const pdfBytes = await pdfDoc.save();
      const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      const fileName = `تقرير-شامل-${todayIso()}.pdf`;
      const path = await saveWorkbookToDevice(arrayBuffer, fileName, REPORTS_DIR);
      if (path) {
        setStatusMessage(`تم حفظ تقرير PDF في: ${path}`);
      }
    } catch {
      setStatusMessage("فشل تصدير تقرير PDF.");
    }
  }

  async function exportFullDataExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const peopleSheet = workbook.addWorksheet("الأشخاص");
    peopleSheet.addRow(["الاسم", "الهاتف", "الرصيد", "العملة", "آخر تحديث"]);
    people.forEach((person) => {
      const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
      const lines = balanceToLines(balance);
      if (!lines.length) {
        peopleSheet.addRow([person.name, person.phone, 0, "SYP", person.createdAt]);
      } else {
        lines.forEach((line) => {
          peopleSheet.addRow([person.name, person.phone, line.value, line.code, person.createdAt]);
        });
      }
    });

    const entriesSheet = workbook.addWorksheet("العمليات");
    entriesSheet.addRow(["التاريخ", "الشخص", "النوع", "المبلغ", "العملة", "الوصف", "البضاعة"]);
    entries.forEach((entry) => {
      const personName = people.find((item) => item.id === entry.personId)?.name ?? "-";
      const productName = products.find((item) => item.id === entry.productId)?.name ?? "";
      entriesSheet.addRow([entry.date, personName, entry.type, entry.amount, entry.currency, entry.description, productName]);
    });

    const productsSheet = workbook.addWorksheet("البضائع");
    productsSheet.addRow(["الاسم", "الكمية الحالية", "إجمالي المشترى", "إجمالي المبيع"]);
    products.forEach((product) => {
      const movements = stockMovements.filter((item) => item.productId === product.id);
      const bought = movements.filter((m) => m.type === "add").reduce((s, m) => s + m.quantity, 0);
      const sold = movements.filter((m) => m.type === "subtract").reduce((s, m) => s + m.quantity, 0);
      productsSheet.addRow([product.name, product.quantity, bought, sold]);
    });

    const movementSheet = workbook.addWorksheet("سجل_الحركة");
    movementSheet.addRow(["التاريخ", "البضاعة", "النوع", "الكمية", "الملاحظات"]);
    stockMovements.forEach((movement) => {
      const productName = products.find((item) => item.id === movement.productId)?.name ?? "-";
      movementSheet.addRow([movement.date, productName, movement.type, movement.quantity, movement.note]);
    });

    const remindersSheet = workbook.addWorksheet("التذكيرات");
    remindersSheet.addRow(["التاريخ", "الشخص", "النص", "الحالة"]);
    reminders.forEach((item) => {
      const personName = people.find((p) => p.id === item.personId)?.name ?? "-";
      remindersSheet.addRow([item.dueAt, personName, item.note, item.notifiedAt ? "تم" : "قادم"]);
    });

    const settingsSheet = workbook.addWorksheet("الإعدادات");
    settingsSheet.addRow(["اسم المحل", shopSettings.shopName]);
    settingsSheet.addRow(["اسم الكاشير", shopSettings.cashierName]);
    settingsSheet.addRow(["هاتف الكاشير", shopSettings.cashierPhone]);
    settingsSheet.addRow(["العملة الافتراضية", currency]);

    const buffer = await workbook.xlsx.writeBuffer();
    const path = await saveWorkbookToDevice(buffer as ArrayBuffer, `ديوني-full-export-${todayIso()}.xlsx`, EXPORTS_DIR);
    if (path) {
      setStatusMessage(`تم تصدير البيانات بنجاح إلى: ${path}`);
    }
  }

  async function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());

      const peopleSheet = workbook.getWorksheet("Persons");
      const entriesSheet = workbook.getWorksheet("Transactions");
      if (!peopleSheet || !entriesSheet) {
        setStatusMessage("الملف لا يحتوي على الصفحات المطلوبة.");
        return;
      }

      const importedPeople: Person[] = [];
      const importedEntries: Entry[] = [];
      const importedReminders: Reminder[] = [];
      let importedCurrency: CurrencyCode = "SYP";

      const peopleHeader = getHeaderMap(peopleSheet.getRow(1));
      peopleSheet.eachRow((row, index) => {
        if (index === 1) {
          return;
        }
        const name = cellToString(row.getCell(peopleHeader.get("name") ?? 2).value).trim();
        if (!name) {
          return;
        }
        importedPeople.push({
          id: cellToString(row.getCell(peopleHeader.get("id") ?? 1).value) || uid(),
          name,
          phone: cellToString(row.getCell(peopleHeader.get("phone") ?? 3).value),
          note: cellToString(row.getCell(peopleHeader.get("note") ?? 4).value),
          createdAt: cellToString(row.getCell(peopleHeader.get("createdat") ?? 5).value) || new Date().toISOString(),
        });
      });

      const validIds = new Set(importedPeople.map((person) => person.id));
      const entriesHeader = getHeaderMap(entriesSheet.getRow(1));
      entriesSheet.eachRow((row, index) => {
        if (index === 1) {
          return;
        }
        const personId = cellToString(row.getCell(entriesHeader.get("personid") ?? 2).value);
        const type = cellToString(row.getCell(entriesHeader.get("type") ?? 3).value);
        const amount = cellToNumber(row.getCell(entriesHeader.get("amount") ?? 4).value);
        if (!validIds.has(personId)) {
          return;
        }
        if (type !== "debt" && type !== "payment") {
          return;
        }
        if (!amount || amount <= 0) {
          return;
        }
        importedEntries.push({
          id: cellToString(row.getCell(entriesHeader.get("id") ?? 1).value) || uid(),
          personId,
          type,
          amount,
          currency: (cellToString(row.getCell(entriesHeader.get("currency") ?? 5).value) as CurrencyCode) || "SYP",
          description: cellToString(row.getCell(entriesHeader.get("description") ?? 7).value),
          date: cellToString(row.getCell(entriesHeader.get("date") ?? 8).value) || todayIso(),
          createdAt: cellToString(row.getCell(entriesHeader.get("createdat") ?? 9).value) || new Date().toISOString(),
        });
      });

      const remindersSheet = workbook.getWorksheet("Reminders");
      if (remindersSheet) {
        const remindersHeader = getHeaderMap(remindersSheet.getRow(1));
        remindersSheet.eachRow((row, index) => {
          if (index === 1) {
            return;
          }
          const personId = cellToString(row.getCell(remindersHeader.get("personid") ?? 2).value);
          if (!validIds.has(personId)) {
            return;
          }
          const dueAt = cellToString(row.getCell(remindersHeader.get("dueat") ?? 6).value);
          if (!dueAt) {
            return;
          }
          importedReminders.push({
            id: cellToString(row.getCell(remindersHeader.get("id") ?? 1).value) || uid(),
            personId,
            entryId: cellToString(row.getCell(remindersHeader.get("entryid") ?? 3).value) || null,
            note: cellToString(row.getCell(remindersHeader.get("note") ?? 4).value) || "تذكير دين",
            amount: cellToNumber(row.getCell(remindersHeader.get("amount") ?? 5).value),
            dueAt,
            createdAt: cellToString(row.getCell(remindersHeader.get("createdat") ?? 7).value) || new Date().toISOString(),
            notifiedAt: cellToString(row.getCell(remindersHeader.get("notifiedat") ?? 8).value) || null,
            notificationId: Number(cellToString(row.getCell(remindersHeader.get("notificationid") ?? 9).value)) || null,
          });
        });
      }

      const summarySheet = workbook.getWorksheet("Summary");
      summarySheet?.eachRow((row, index) => {
        if (index === 1) {
          return;
        }
        const metric = cellToString(row.getCell(1).value);
        const value = cellToString(row.getCell(2).value);
        if (metric === "selectedCurrency" && (value === "SYP" || value === "USD")) {
          importedCurrency = value;
        }
      });

      await replaceAllData(importedPeople, importedEntries, importedReminders, importedCurrency);
      await refreshData();
      setStatusMessage("تمت استعادة البيانات من ملف Excel.");
    } catch {
      setStatusMessage("فشل استعادة البيانات من الملف.");
    }
  }

  async function saveAndExit() {
    try {
      const path = await exportExcel(`ديوني-backup-${todayIso()}.xlsx`);
      if (!path) {
        return;
      }
      setStatusMessage("تم الحفظ. جاري الخروج...");
      if (isNativeApp()) {
        setTimeout(() => {
          void CapacitorApp.exitApp();
        }, 500);
      }
    } catch {
      setStatusMessage("فشل حفظ النسخة الاحتياطية، لن يتم الإغلاق.");
    }
  }

  function openAddProduct() {
    setEditingProductId(null);
    setProductForm({ name: "", quantity: "0", lowStockThreshold: "5" });
    setShowProductForm(true);
  }

  function openEditProduct(product: Product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      quantity: String(product.quantity),
      lowStockThreshold: String(product.lowStockThreshold),
    });
    setShowProductForm(true);
  }

  async function handleSubmitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productForm.name.trim()) {
      return;
    }
    const quantity = Number(productForm.quantity || "0");
    const threshold = Number(productForm.lowStockThreshold || "5");
    const existing = products.find((item) => item.id === editingProductId);
    const product: Product = {
      id: editingProductId ?? uid(),
      name: productForm.name.trim(),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      lowStockThreshold: Number.isFinite(threshold) ? threshold : 5,
      updatedAt: new Date().toISOString(),
    };
    await putRecord("products", product);
    await putRecord("stock_movements", {
      id: uid(),
      productId: product.id,
      type: existing ? "manual" : "add",
      quantity: product.quantity,
      date: new Date().toISOString(),
      note: existing ? "تعديل يدوي" : "إضافة بضاعة",
    } as StockMovement);
    setShowProductForm(false);
    await refreshData();
  }

  async function adjustProductQuantity(product: Product, delta: number) {
    if (delta < 0 && Math.abs(delta) > product.quantity) {
      setStockErrorMessage(
        `⚠️ الكمية المطلوبة (${Math.abs(delta)}) أكبر من المتوفر (${product.quantity}).\nالرجاء تعديل الكمية.`
      );
      return;
    }
    const next = Math.max(0, normalizeAmount(product.quantity + delta));
    await putRecord("products", { ...product, quantity: next, updatedAt: new Date().toISOString() });
    await putRecord("stock_movements", {
      id: uid(),
      productId: product.id,
      type: delta >= 0 ? "add" : "subtract",
      quantity: Math.abs(delta),
      date: new Date().toISOString(),
      note: delta >= 0 ? "إضافة كمية" : "خصم كمية",
    } as StockMovement);
    await refreshData();
  }

  async function openQuantityAdjust(product: Product, mode: "add" | "subtract") {
    const value = window.prompt(mode === "add" ? "أدخل الكمية المضافة" : "أدخل الكمية المخصومة", "1");
    if (!value) {
      return;
    }
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockErrorMessage("⚠️ الكمية المدخلة غير صحيحة.");
      return;
    }
    await adjustProductQuantity(product, mode === "add" ? quantity : -quantity);
  }

  async function deleteProduct(productId: string) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["products", "stock_movements"], "readwrite");
      tx.objectStore("products").delete(productId);
      const movementStore = tx.objectStore("stock_movements");
      const index = movementStore.index("productId");
      index.openCursor(IDBKeyRange.only(productId)).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          movementStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await refreshData();
  }

  async function sharePersonReport(person: Person, asType: "png" | "pdf") {
    const personEntries = entries.filter((item) => item.personId === person.id && item.type === "debt");
    const lines = personEntries.map((item) => {
      const paidForItem = entries
        .filter((e) => e.personId === person.id && e.type === "payment" && e.currency === item.currency)
        .reduce((sum, e) => sum + e.amount, 0);
      const isPartial = paidForItem > 0 && paidForItem < item.amount;
      if (isPartial) {
        return `- ${item.description || "بضاعة"}: ${formatMoney(item.amount, item.currency)} (دفع ${formatMoney(
          paidForItem,
          item.currency
        )}، متبقي ${formatMoney(item.amount - paidForItem, item.currency)})`;
      }
      return `- ${item.description || "بضاعة"}: ${formatMoney(item.amount, item.currency)} (${item.date})`;
    });
    const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
    const reportLines = [
      "━━━━━━━━━━━━━━━━━━━",
      `      ${shopSettings.shopName || "ديوني"}`,
      "      كشف حساب",
      "━━━━━━━━━━━━━━━━━━━",
      `الاسم: ${person.name}`,
      `الهاتف: ${person.phone || "-"}`,
      `التاريخ: ${todayIso()}`,
      "━━━━━━━━━━━━━━━━━━━",
      "البضائع غير المدفوعة:",
      ...lines,
      "━━━━━━━━━━━━━━━━━━━",
      "إجمالي المتبقي:",
      ...balanceToLines(balance).map((line) => `- ${formatMoney(line.value, line.code)}`),
      "━━━━━━━━━━━━━━━━━━━",
      `${shopSettings.cashierName || ""}`,
      `${shopSettings.cashierPhone || ""}`,
    ];

    if (!isNativeApp()) {
      await Share.share({
        title: `كشف حساب ${person.name}`,
        text: reportLines.join("\n"),
        dialogTitle: asType === "pdf" ? "مشاركة PDF" : "مشاركة صورة",
      });
      return;
    }

    await ensureAldyonFolders();
    const targetNode = accountReportRef.current;
    if (!targetNode) {
      setStatusMessage("تعذر العثور على كشف الحساب الحالي للمشاركة.");
      return;
    }

    try {
      const dataUrl = await domtoimage.toPng(targetNode, {
        bgcolor: "#ffffff",
        quality: 1,
        width: targetNode.scrollWidth,
        height: targetNode.scrollHeight,
      });
      if (asType === "png") {
        const base64 = dataUrl.split(",")[1];
        const fileName = `كشف-حساب-${person.name}-${todayIso()}.png`;
        const saved = await Filesystem.writeFile({
          path: `${REPORTS_DIR}/${fileName}`,
          directory: Directory.ExternalStorage,
          data: base64,
          recursive: true,
        });
        await Share.share({
          title: `كشف حساب ${person.name}`,
          url: saved.uri,
          dialogTitle: "مشاركة صورة",
        });
      } else {
        const pngBase64 = dataUrl.split(",")[1];
        const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
        const pdfDoc = await PDFDocument.create();
        const image = await pdfDoc.embedPng(pngBytes);
        const page = pdfDoc.addPage([595, 842]);
        const fitWidth = 520;
        const fitHeight = (image.height * fitWidth) / image.width;
        page.drawImage(image, { x: 35, y: Math.max(20, 820 - fitHeight), width: fitWidth, height: Math.min(fitHeight, 780) });
        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
        const fileName = `كشف-حساب-${person.name}-${todayIso()}.pdf`;
        const uri = await saveWorkbookToDevice(pdfBuffer, fileName, REPORTS_DIR);
        if (uri) {
          await Share.share({ title: `كشف حساب ${person.name}`, url: uri, dialogTitle: "مشاركة PDF" });
        }
      }
    } catch {
      setStatusMessage("فشلت مشاركة التقرير. حاول مرة أخرى.");
    }
  }

  async function loadShopSettings() {
    const db = await openDb();
    const settings = await new Promise<{ shopName: string; cashierName: string; cashierPhone: string }>((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, "readonly");
      const store = tx.objectStore(SETTINGS_STORE);
      const shopNameReq = store.get("shop_name");
      const cashierNameReq = store.get("cashier_name");
      const cashierPhoneReq = store.get("cashier_phone");
      tx.oncomplete = () =>
        resolve({
          shopName: shopNameReq.result?.value ?? "",
          cashierName: cashierNameReq.result?.value ?? "",
          cashierPhone: cashierPhoneReq.result?.value ?? "",
        });
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    setShopSettings(settings);
  }

  async function saveShopSettings() {
    try {
      await putRecord(SETTINGS_STORE, { key: "shop_name", value: shopSettings.shopName });
      await putRecord(SETTINGS_STORE, { key: "cashier_name", value: shopSettings.cashierName });
      await putRecord(SETTINGS_STORE, { key: "cashier_phone", value: shopSettings.cashierPhone });
      setStatusMessage("تم حفظ الإعدادات بنجاح ✅");
    } catch {
      setStatusMessage("فشل حفظ الإعدادات.");
    }
  }

  async function openAldyonFolder() {
    if (!isNativeApp()) {
      setStatusMessage("المجلد: /storage/emulated/0/Download/Aldyon");
      return;
    }
    try {
      await ensureAldyonFolders();
      const documentUri = "content://com.android.externalstorage.documents/document/primary%3ADownload%2FAldyon";
      const canOpen = await AppLauncher.canOpenUrl({ url: documentUri });
      if (canOpen.value) {
        await AppLauncher.openUrl({ url: documentUri });
        return;
      }

      const filesApp = await AppLauncher.canOpenUrl({ url: "com.google.android.documentsui" });
      if (filesApp.value) {
        await AppLauncher.openUrl({ url: "com.google.android.documentsui" });
        setStatusMessage("تم فتح مدير الملفات. انتقل إلى Download/Aldyon.");
        return;
      }

      setStatusMessage("تعذر فتح المجلد مباشرة. افتح مدير الملفات واذهب إلى: /storage/emulated/0/Download/Aldyon");
    } catch {
      setStatusMessage("تعذر فتح المجلد مباشرة. افتح مدير الملفات واذهب إلى: /storage/emulated/0/Download/Aldyon");
    }
  }

  async function addUser() {
    if (!userForm.name.trim()) {
      return;
    }
    const user: AppUser = {
      id: uid(),
      name: userForm.name.trim(),
      role: userForm.role,
      createdAt: new Date().toISOString(),
    };
    await putRecord("users", user);
    setUserForm({ name: "", role: "employee" });
    await refreshData();
  }

  async function runAutoBackupIfNeeded() {
    const today = todayIso();
    if (localStorage.getItem("dayooni_last_backup_date") === today) {
      return;
    }
    try {
      const path = await exportExcel(`ديوني-backup-${today}.xlsx`);
      if (!path) {
        return;
      }
      localStorage.setItem("dayooni_last_backup_date", today);

      if (isNativeApp()) {
        const files = await Filesystem.readdir({ path: BACKUPS_DIR, directory: Directory.ExternalStorage });
        const backups = files.files
          .map((file) => (typeof file === "string" ? file : file.name ?? ""))
          .filter((name) => name.endsWith(".xlsx"))
          .sort();
        if (backups.length > 7) {
          const toDelete = backups.slice(0, backups.length - 7);
          for (const file of toDelete) {
            await Filesystem.deleteFile({ path: `${BACKUPS_DIR}/${file}`, directory: Directory.ExternalStorage });
          }
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 2000000000),
              title: "ديوني",
              body: "تم إنشاء نسخة احتياطية تلقائية بنجاح.",
              schedule: { at: new Date(Date.now() + 1000) },
            },
          ],
        });
      }
    } catch {
      // Ignore auto backup failures to avoid blocking user flow.
    }
  }

  async function saveInvoiceText(person: Person) {
    const personEntries = entries.filter((item) => item.personId === person.id);
    const counter = invoices.length + 1;
    const invoiceNo = `${new Date().getFullYear()}-${String(counter).padStart(3, "0")}`;
    const remaining = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
    const paidEntry = personEntries.filter((item) => item.type === "payment").slice(-1)[0];
    const paidAmount = paidEntry?.amount ?? 0;
    const paidCurrency = paidEntry?.currency ?? "SYP";

    const lines = [
      "━━━━━━━━━━━━━━━━━━━",
      `       ${shopSettings.shopName || "ديوني"}`,
      "━━━━━━━━━━━━━━━━━━━",
      `رقم الفاتورة: ${invoiceNo}`,
      `التاريخ: ${todayIso()}`,
      `الاسم: ${person.name}`,
      `الهاتف: ${person.phone || "-"}`,
      "━━━━━━━━━━━━━━━━━━━",
      `المدفوع: ${formatMoney(paidAmount, paidCurrency)}`,
      ...balanceToLines(remaining).map((line) => `المتبقي: ${formatMoney(line.value, line.code)}`),
      "━━━━━━━━━━━━━━━━━━━",
      "    شكراً لتعاملكم معنا",
      `${shopSettings.cashierName || ""}`,
      `${shopSettings.cashierPhone || ""}`,
      "━━━━━━━━━━━━━━━━━━━",
    ];

    await putRecord("invoices", {
      id: uid(),
      invoiceNo,
      personId: person.id,
      entryIds: personEntries.map((item) => item.id),
      paidAmount,
      paidCurrency,
      remainingByCurrency: remaining,
      createdAt: new Date().toISOString(),
    } as Invoice);

    const payload = lines.join("\n");
    if (isNativeApp()) {
      await ensureAldyonFolders();
      await Filesystem.writeFile({
        path: `${INVOICES_DIR}/فاتورة-${invoiceNo}.txt`,
        directory: Directory.ExternalStorage,
        data: textToBase64(payload),
        recursive: true,
      });
    }
    await refreshData();
    return payload;
  }

  async function registerReturn(entry: Entry) {
    if (entry.type !== "debt") {
      return;
    }
    await putRecord("entries", {
      id: uid(),
      personId: entry.personId,
      type: "payment",
      amount: entry.amount,
      currency: entry.currency,
      description: `مرتجع عن: ${entry.description || "بضاعة"}`,
      date: todayIso(),
      createdAt: new Date().toISOString(),
    } as Entry);

    if (entry.productId && entry.quantity) {
      const product = products.find((item) => item.id === entry.productId);
      if (product) {
        await putRecord("products", {
          ...product,
          quantity: normalizeAmount(product.quantity + entry.quantity),
          updatedAt: new Date().toISOString(),
        });
        await putRecord("stock_movements", {
          id: uid(),
          productId: product.id,
          type: "add",
          quantity: entry.quantity,
          date: new Date().toISOString(),
          note: `مرتجع من ${people.find((p) => p.id === entry.personId)?.name ?? "عميل"}`,
        } as StockMovement);
      }
    }
    await refreshData();
    setStatusMessage("تم تسجيل المرتجع بنجاح.");
  }

  function startLongPressDelete(entry: Entry) {
    longPressTimer.current = window.setTimeout(() => {
      setEntryToDelete(entry);
    }, 700);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const tabButton = (tab: Tab, title: string) => (
    <button
      key={tab}
      onClick={() => {
        setActiveTab(tab);
        if (tab !== "people") {
          setSelectedPersonId(null);
        }
      }}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        activeTab === tab ? "bg-[#2E4A3B] text-white" : "bg-white text-[#2E4A3B] hover:bg-[#f0ece2]"
      }`}
    >
      {title}
    </button>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F4EA] text-[#1f2c24]">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <img src="/yam-icon.png" alt="ديوني" className="h-14 w-14 rounded-2xl" />
            <div>
              <h1 className="text-3xl font-bold text-[#2E4A3B]">ديوني</h1>
              <p className="text-sm text-[#5a655d]">تطبيق إدارة ديون يعمل محليا بدون إنترنت</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void exportExcel()}
              className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#22392d]"
            >
              نسخة Excel
            </button>
            <label className="cursor-pointer rounded-xl border border-[#2E4A3B]/30 bg-white px-4 py-2 text-sm font-medium text-[#2E4A3B] hover:bg-[#f2efe6]">
              استعادة
              <input type="file" className="hidden" accept=".xlsx" onChange={(event) => void onImportFile(event)} />
            </label>
            <button
              onClick={() => void saveAndExit()}
              className="rounded-xl border border-[#b34738] px-4 py-2 text-sm font-medium text-[#b34738] hover:bg-[#fff2ee]"
            >
              حفظ وخروج
            </button>
          </div>
        </motion.header>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "إجمالي المستحق", value: formatBalanceMap(totals.dueNow) },
            { label: "إجمالي الديون", value: formatBalanceMap(totals.totalDebt) },
            { label: "إجمالي المدفوعات", value: formatBalanceMap(totals.totalPayments) },
            { label: "عدد الأشخاص", value: `${totals.peopleCount}` },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="rounded-2xl bg-white/90 p-4"
            >
              <p className="text-sm text-[#5f665f]">{item.label}</p>
              <p className="mt-1 text-xl font-semibold text-[#2E4A3B]">{item.value}</p>
            </motion.div>
          ))}
        </section>

        <div className="mb-4 flex flex-wrap gap-2">
          {tabButton("overview", "نظرة عامة")}
          {tabButton("people", "الأشخاص")}
          {tabButton("transactions", "سجل العمليات")}
          {tabButton("reports", "التقارير")}
          {tabButton("reminders", "التذكيرات")}
          {tabButton("inventory", "إدارة البضائع")}
        </div>

        {statusMessage && <div className="mb-4 rounded-xl bg-[#edf5ef] px-4 py-3 text-sm text-[#2E4A3B]">{statusMessage}</div>}

        {loading ? (
          <p className="text-center text-[#5a655d]">جاري التحميل...</p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.main
              key={`${activeTab}-${selectedPersonId ?? "none"}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl bg-white/90 p-5"
            >
              {activeTab === "overview" && (
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold text-[#2E4A3B]">نظرة عامة</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="currency" className="text-sm text-[#5f665f]">
                      العملة
                    </label>
                    <select
                      id="currency"
                      value={currency}
                      onChange={(event) => void handleChangeCurrency(event.target.value as CurrencyCode)}
                      className="rounded-xl border border-[#cfd7cf] bg-white px-3 py-2 text-sm"
                    >
                      <option value="SYP">ليرة سورية (ل.س)</option>
                      <option value="USD">دولار أمريكي ($)</option>
                    </select>
                  </div>
                  <p>الديون الجديدة هذا الشهر: <strong>{formatBalanceMap(totals.newDebts)}</strong></p>
                  <p>إجمالي الأرصدة المستحقة حاليا: <strong>{formatBalanceMap(totals.dueNow)}</strong></p>
                  <button
                    onClick={() => openAddEntry()}
                    className="mt-2 rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#22392d]"
                  >
                    إضافة عملية سريعة
                  </button>
                  <p className="text-sm text-[#b34738]">⚠️ بضائع قاربت على النفاذ: {lowStockCount}</p>
                  <button
                    onClick={() => void openAldyonFolder()}
                    className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                  >
                    فتح مجلد Aldyon
                  </button>
                  <div className="space-y-2 rounded-xl border border-[#e3e7e1] p-3">
                    <p className="text-sm font-medium text-[#2E4A3B]">إعدادات المحل والفواتير</p>
                    <input
                      value={shopSettings.shopName}
                      onChange={(event) => setShopSettings((prev) => ({ ...prev, shopName: event.target.value }))}
                      placeholder="اسم المحل"
                      className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                    />
                    <input
                      value={shopSettings.cashierName}
                      onChange={(event) => setShopSettings((prev) => ({ ...prev, cashierName: event.target.value }))}
                      placeholder="اسم الكاشير"
                      className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                    />
                    <input
                      value={shopSettings.cashierPhone}
                      onChange={(event) => setShopSettings((prev) => ({ ...prev, cashierPhone: event.target.value }))}
                      placeholder="هاتف الكاشير"
                      className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                    />
                    <select
                      value={currentUserId}
                      onChange={(event) => setCurrentUserId(event.target.value)}
                      className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                    >
                      <option value="">اختر المستخدم</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} - {user.role === "admin" ? "مدير" : "موظف"}</option>
                      ))}
                    </select>
                    {isAdmin && (
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={userForm.name}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="اسم مستخدم"
                          className="col-span-2 rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                        />
                        <select
                          value={userForm.role}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
                          className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                        >
                          <option value="employee">موظف</option>
                          <option value="admin">مدير</option>
                        </select>
                      </div>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => void addUser()}
                        className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                      >
                        إضافة مستخدم
                      </button>
                    )}
                    <button
                      onClick={() => void saveShopSettings()}
                      type="button"
                      className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                    >
                      حفظ إعدادات المحل
                    </button>
                  </div>
                  <p className="pt-3 text-center text-xs text-[#98a199]">تصميم Y.A.M</p>
                </section>
              )}

              {activeTab === "people" && !selectedPerson && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-[#2E4A3B]">الأشخاص</h2>
                    <button
                      onClick={openAddPerson}
                      className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#22392d]"
                    >
                      إضافة شخص
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      value={personSearch}
                      onChange={(event) => setPersonSearch(event.target.value)}
                      placeholder="بحث بالاسم أو الهاتف"
                      className="min-w-64 flex-1 rounded-xl border border-[#cfd7cf] bg-white px-3 py-2 text-sm outline-none focus:border-[#2E4A3B]"
                    />
                    <select
                      value={personFilter}
                      onChange={(event) => setPersonFilter(event.target.value as "all" | "debt" | "settled")}
                      className="rounded-xl border border-[#cfd7cf] bg-white px-3 py-2 text-sm"
                    >
                      <option value="all">الكل</option>
                      <option value="debt">عليهم ديون</option>
                      <option value="settled">تم التسديد</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    {filteredPeople.map((person) => {
                      const balance = (personBalanceMap.get(person.id) ?? { ...ZERO_BALANCE }) as BalanceMap;
                      const hasDebt = (Object.keys(CURRENCY_META) as CurrencyCode[]).some((code) => balance[code] > 0);
                      return (
                        <motion.button
                          key={person.id}
                          whileHover={{ x: -3 }}
                          onClick={() => setSelectedPersonId(person.id)}
                          className="flex w-full items-center justify-between rounded-xl border border-[#e2e6df] px-3 py-3 text-right"
                        >
                          <div>
                            <p className="font-semibold text-[#1e3327]">{person.name}</p>
                            <p className="text-xs text-[#5f665f]">{person.phone || "لا يوجد هاتف"}</p>
                          </div>
                          <p className={`font-semibold ${hasDebt ? "text-[#a44737]" : "text-[#2E4A3B]"}`}>
                            {formatBalanceMap(balance)}
                          </p>
                        </motion.button>
                      );
                    })}
                    {filteredPeople.length === 0 && <p className="text-sm text-[#5f665f]">لا يوجد أشخاص مطابقون.</p>}
                  </div>
                </section>
              )}

              {activeTab === "people" && selectedPerson && (
                <section ref={accountReportRef} className="space-y-4">
                  <button onClick={() => setSelectedPersonId(null)} className="text-sm text-[#2E4A3B] underline">
                    عودة لقائمة الأشخاص
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold text-[#2E4A3B]">{selectedPerson.name}</h2>
                      <p className="text-sm text-[#5f665f]">{selectedPerson.phone || "لا يوجد رقم هاتف"}</p>
                      {selectedPerson.note && <p className="text-sm text-[#5f665f]">{selectedPerson.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditPerson(selectedPerson)}
                        disabled={!isAdmin}
                        className="rounded-xl border border-[#2E4A3B]/40 px-3 py-2 text-sm text-[#2E4A3B] hover:bg-[#f2efe6]"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => setPersonToDelete(selectedPerson)}
                        disabled={!isAdmin}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#b34738] px-3 py-2 text-sm text-[#b34738] hover:bg-[#fff2ee]"
                      >
                        <span aria-hidden="true">🗑️</span>
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="font-semibold">
                    <p>الرصيد:</p>
                    {(balanceToLines((personBalanceMap.get(selectedPerson.id) ?? { ...ZERO_BALANCE }) as BalanceMap).length
                      ? balanceToLines((personBalanceMap.get(selectedPerson.id) ?? { ...ZERO_BALANCE }) as BalanceMap)
                      : [{ code: "SYP" as CurrencyCode, value: 0 }]
                    ).map((line) => (
                      <p key={line.code} className="text-sm font-normal">- {formatMoney(line.value, line.code)}</p>
                    ))}
                  </div>

                  <button
                    onClick={() => openAddEntry(selectedPerson.id)}
                    className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#22392d]"
                  >
                    إضافة دين / دفعة
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void sharePersonReport(selectedPerson, "png")}
                      className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                    >
                      مشاركة صورة
                    </button>
                    <button
                      onClick={() => void sharePersonReport(selectedPerson, "pdf")}
                      className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                    >
                      مشاركة PDF
                    </button>
                    <button
                      onClick={() => void saveInvoiceText(selectedPerson)}
                      className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                    >
                      حفظ فاتورة
                    </button>
                  </div>

                  <div className="space-y-2">
                    {selectedPersonEntries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-[#e2e6df] px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className={entry.type === "debt" ? "text-[#b34738]" : "text-[#2E4A3B]"}>
                            {entry.type === "debt" ? "+" : "-"} {formatMoney(entry.amount, entry.currency)}
                          </p>
                          <p className="text-xs text-[#5f665f]">{dateFormatter.format(new Date(entry.date))}</p>
                        </div>
                        <p className="text-sm text-[#5f665f]">{entry.description || "-"}</p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => openEditEntry(entry)}
                            className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => setEntryToDelete(entry)}
                            className="rounded-lg border border-[#b34738] px-2 py-1 text-xs text-[#b34738]"
                          >
                            🗑️ حذف
                          </button>
                          {entry.type === "debt" && (
                            <button
                              onClick={() => void registerReturn(entry)}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              إرجاع
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedPersonEntries.length === 0 && <p className="text-sm text-[#5f665f]">لا توجد عمليات.</p>}
                  </div>
                </section>
              )}

              {activeTab === "transactions" && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-[#2E4A3B]">سجل العمليات</h2>
                    <button
                      onClick={() => openAddEntry()}
                      className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#22392d]"
                    >
                      عملية جديدة
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      value={entrySearch}
                      onChange={(event) => setEntrySearch(event.target.value)}
                      placeholder="بحث في العمليات"
                      className="min-w-64 flex-1 rounded-xl border border-[#cfd7cf] bg-white px-3 py-2 text-sm outline-none focus:border-[#2E4A3B]"
                    />
                    <select
                      value={entryFilter}
                      onChange={(event) => setEntryFilter(event.target.value as "all" | EntryType)}
                      className="rounded-xl border border-[#cfd7cf] bg-white px-3 py-2 text-sm"
                    >
                      <option value="all">الكل</option>
                      <option value="payment">المدفوعات</option>
                      <option value="debt">الديون</option>
                    </select>
                  </div>

                  <p className="text-xs text-[#5f665f]">اضغط مطولا للحذف، أو استخدم زر تعديل.</p>

                  <div className="space-y-2">
                    {filteredEntries.map((entry) => {
                      const personName = people.find((person) => person.id === entry.personId)?.name ?? "غير معروف";
                      return (
                        <motion.div
                          key={entry.id}
                          layout
                          onMouseDown={() => startLongPressDelete(entry)}
                          onMouseUp={cancelLongPress}
                          onMouseLeave={cancelLongPress}
                          onTouchStart={() => startLongPressDelete(entry)}
                          onTouchEnd={cancelLongPress}
                          className="rounded-xl border border-[#e2e6df] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-[#1f2c24]">{personName}</p>
                            <p className={entry.type === "debt" ? "text-[#b34738]" : "text-[#2E4A3B]"}>
                              {entry.type === "debt" ? "+" : "-"} {formatMoney(entry.amount, entry.currency)}
                            </p>
                          </div>
                          <p className="text-sm text-[#5f665f]">{entry.description || "-"}</p>
                          <p className="text-xs text-[#5f665f]">{dateFormatter.format(new Date(entry.date))}</p>
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => openEditEntry(entry)}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              تعديل
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                    {filteredEntries.length === 0 && <p className="text-sm text-[#5f665f]">لا توجد عمليات.</p>}
                  </div>
                </section>
              )}

              {activeTab === "reports" && (
                <section className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#2E4A3B]">التقارير</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void exportPdfReport()}
                        className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                      >
                        تصدير PDF
                      </button>
                      <button
                        onClick={() => void exportFullDataExcel()}
                        className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                      >
                        تصدير كل البيانات
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {monthlyReport.map(([month, values]) => (
                      <div key={month} className="space-y-1">
                        <div className="flex items-center justify-between text-sm text-[#5f665f]">
                          <span>{month}</span>
                          <span>دين {formatCurrency(values.debt)} / دفعات {formatCurrency(values.payment)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#ebe8dd]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(values.debt / maxMonthValue) * 100}%` }}
                            className="h-full bg-[#b34738]"
                          />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#ebe8dd]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(values.payment / maxMonthValue) * 100}%` }}
                            className="h-full bg-[#2E4A3B]"
                          />
                        </div>
                      </div>
                    ))}
                    {monthlyReport.length === 0 && <p className="text-sm text-[#5f665f]">لا توجد بيانات كافية للتقارير.</p>}
                  </div>
                </section>
              )}

              {activeTab === "reminders" && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-[#2E4A3B]">التذكيرات</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void requestNotificationPermission()}
                        className="rounded-xl border border-[#2E4A3B]/35 px-3 py-2 text-sm text-[#2E4A3B]"
                      >
                        تفعيل الإشعارات
                      </button>
                      <button
                        onClick={openAddReminder}
                        className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white"
                      >
                        إضافة تذكير
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {sortedReminders.map((reminder) => {
                      const personName = people.find((person) => person.id === reminder.personId)?.name ?? "غير معروف";
                      const isOverdue = new Date(reminder.dueAt) < new Date();
                      return (
                        <div key={reminder.id} className={`rounded-xl border px-3 py-3 ${isOverdue ? "border-[#b34738]" : "border-[#e2e6df]"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`font-semibold ${isOverdue ? "text-[#b34738]" : "text-[#1f2c24]"}`}>{personName}</p>
                            <p className="text-xs text-[#5f665f]">{dateTimeFormatter.format(new Date(reminder.dueAt))}</p>
                          </div>
                          <p className="text-sm text-[#5f665f]">{reminder.note}</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={() => openEditReminder(reminder)}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => setReminderToDelete(reminder)}
                              className="rounded-lg border border-[#b34738] px-2 py-1 text-xs text-[#b34738]"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {sortedReminders.length === 0 && <p className="text-sm text-[#5f665f]">لا توجد تذكيرات حالياً.</p>}
                  </div>
                </section>
              )}

              {activeTab === "inventory" && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-[#2E4A3B]">إدارة البضائع</h2>
                    <button
                      onClick={openAddProduct}
                      className="rounded-xl bg-[#2E4A3B] px-4 py-2 text-sm font-medium text-white"
                    >
                      + إضافة بضاعة
                    </button>
                  </div>

                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="بحث باسم البضاعة"
                    className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                  />

                  <div className="space-y-2">
                    {filteredProducts.map((product) => {
                      const lowStock = product.quantity < product.lowStockThreshold;
                      return (
                        <div key={product.id} className="rounded-xl border border-[#e2e6df] px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => setSelectedProductId(product.id)}
                              className={`font-semibold ${lowStock ? "text-[#b34738]" : "text-[#1f2c24]"}`}
                            >
                              {product.name} {lowStock ? "⚠️" : ""}
                            </button>
                            <p className={`text-sm ${lowStock ? "text-[#b34738]" : "text-[#5f665f]"}`}>
                              الكمية: {product.quantity}
                            </p>
                          </div>
                          <p className="text-xs text-[#5f665f]">آخر تحديث: {dateTimeFormatter.format(new Date(product.updatedAt))}</p>
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            <button
                              onClick={() => void openQuantityAdjust(product, "add")}
                              disabled={!isAdmin}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              + كمية
                            </button>
                            <button
                              onClick={() => void openQuantityAdjust(product, "subtract")}
                              disabled={!isAdmin}
                              className="rounded-lg border border-[#b34738] px-2 py-1 text-xs text-[#b34738]"
                            >
                              - كمية
                            </button>
                            <button
                              onClick={() => openEditProduct(product)}
                              disabled={!isAdmin}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => setSelectedProductId(product.id)}
                              className="rounded-lg border border-[#2E4A3B]/40 px-2 py-1 text-xs text-[#2E4A3B]"
                            >
                              التفاصيل
                            </button>
                            <button
                              onClick={() => void deleteProduct(product.id)}
                              disabled={!isAdmin}
                              className="rounded-lg border border-[#b34738] px-2 py-1 text-xs text-[#b34738]"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {products.length === 0 && <p className="text-sm text-[#5f665f]">لا توجد بضائع حتى الآن.</p>}
                  </div>

                  {selectedProduct && (
                    <div className="space-y-3 rounded-xl border border-[#e2e6df] p-4">
                      <h3 className="font-semibold text-[#2E4A3B]">📦 {selectedProduct.name}</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="date"
                          value={productRange.from}
                          onChange={(event) => setProductRange((prev) => ({ ...prev, from: event.target.value }))}
                          className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                        />
                        <input
                          type="date"
                          value={productRange.to}
                          onChange={(event) => setProductRange((prev) => ({ ...prev, to: event.target.value }))}
                          className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                        />
                      </div>
                      <p className="text-sm text-[#5f665f]">
                        إجمالي المشترى: {selectedProductMovements.filter((m) => m.type === "add").reduce((s, m) => s + m.quantity, 0)}
                      </p>
                      <p className="text-sm text-[#5f665f]">
                        إجمالي المبيع: {selectedProductMovements.filter((m) => m.type === "subtract").reduce((s, m) => s + m.quantity, 0)}
                      </p>
                      <p className="text-sm text-[#5f665f]">الكمية الحالية: {selectedProduct.quantity}</p>
                      <div className="space-y-1">
                        {selectedProductMovements.map((movement) => (
                          <div key={movement.id} className="rounded-lg border border-[#edf0eb] px-3 py-2 text-xs text-[#5f665f]">
                            {movement.date.slice(0, 10)}: {movement.type === "add" ? "شراء" : movement.type === "subtract" ? "بيع" : "تعديل"} {movement.quantity} ({movement.note})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-[#2E4A3B]">سجل الحركة</h3>
                    {[...stockMovements]
                      .sort((a, b) => (a.date < b.date ? 1 : -1))
                      .slice(0, 15)
                      .map((movement) => {
                        const productName = products.find((item) => item.id === movement.productId)?.name ?? "-";
                        return (
                          <div key={movement.id} className="rounded-lg border border-[#edf0eb] px-3 py-2 text-xs text-[#5f665f]">
                            {dateTimeFormatter.format(new Date(movement.date))} - {productName} - {movement.type} - {movement.quantity}
                          </div>
                        );
                      })}
                  </div>
                </section>
              )}
            </motion.main>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {dueAlerts.length > 0 && (
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/35 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-5"
            >
              <h3 className="mb-3 text-lg font-semibold text-[#2E4A3B]">تذكيرات مستحقة</h3>
              <div className="space-y-2 text-sm text-[#5f665f]">
                {dueAlerts.map((item) => (
                  <p key={item.id}>- {item.note}</p>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setDueAlerts([])} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm">
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stockErrorMessage && (
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/35 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-5"
            >
              <h3 className="mb-3 text-lg font-semibold text-[#b34738]">تنبيه المخزون</h3>
              <p className="mb-5 whitespace-pre-line text-sm text-[#5f665f]">{stockErrorMessage}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setStockErrorMessage("")}
                  className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]"
                >
                  موافق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProductForm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={(event) => void handleSubmitProduct(event)}
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-[#2E4A3B]">{editingProductId ? "تعديل بضاعة" : "إضافة بضاعة"}</h3>
              <input
                required
                value={productForm.name}
                onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="اسم البضاعة"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                value={productForm.quantity}
                onChange={(event) => setProductForm((prev) => ({ ...prev, quantity: event.target.value }))}
                placeholder="الكمية"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="1"
                value={productForm.lowStockThreshold}
                onChange={(event) => setProductForm((prev) => ({ ...prev, lowStockThreshold: event.target.value }))}
                placeholder="حد التنبيه (مثال 5)"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]"
                >
                  إلغاء
                </button>
                <button type="submit" className="rounded-xl bg-[#2E4A3B] px-3 py-2 text-sm text-white">
                  حفظ
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPersonForm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={(event) => void handleSubmitPerson(event)}
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-[#2E4A3B]">{editingPersonId ? "تعديل شخص" : "إضافة شخص"}</h3>
              <input
                required
                value={personForm.name}
                onChange={(event) => setPersonForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="الاسم"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <input
                value={personForm.phone}
                onChange={(event) => setPersonForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="رقم الهاتف (اختياري)"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <textarea
                value={personForm.note}
                onChange={(event) => setPersonForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="ملاحظة"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              {!editingPersonId && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={personForm.openingAmount}
                    onChange={(event) => setPersonForm((prev) => ({ ...prev, openingAmount: event.target.value }))}
                    placeholder="رصيد افتتاحي (اختياري)"
                    className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                  />
                  <select
                    value={personForm.openingCurrency}
                    onChange={(event) =>
                      setPersonForm((prev) => ({ ...prev, openingCurrency: event.target.value as CurrencyCode }))
                    }
                    className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                  >
                    <option value="SYP">ل.س</option>
                    <option value="USD">$</option>
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowPersonForm(false)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button type="submit" className="rounded-xl bg-[#2E4A3B] px-3 py-2 text-sm text-white">
                  حفظ
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEntryForm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={(event) => void handleSubmitEntry(event)}
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-[#2E4A3B]">{editingEntryId ? "تعديل عملية" : "إضافة عملية"}</h3>
              <select
                value={entryForm.personId}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, personId: event.target.value }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                required
              >
                <option value="">اختر الشخص</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <select
                value={entryForm.type}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, type: event.target.value as EntryType }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              >
                <option value="debt">دين / شحن</option>
                <option value="payment">دفعة</option>
              </select>
              <select
                value={entryForm.currency}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, currency: event.target.value as CurrencyCode }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              >
                <option value="SYP">ليرة سورية (ل.س)</option>
                <option value="USD">دولار أمريكي ($)</option>
              </select>

              {entryForm.type === "debt" && (
                <select
                  value={entryForm.productId}
                  onChange={(event) => {
                    const productId = event.target.value;
                    const product = products.find((item) => item.id === productId);
                    setEntryForm((prev) => ({
                      ...prev,
                      productId,
                      description: product ? product.name : prev.description,
                    }));
                  }}
                  className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                >
                  <option value="">بضاعة تانية (يدوي)</option>
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} (متوفر: {item.quantity})</option>
                  ))}
                </select>
              )}

              {entryForm.type === "debt" && entryForm.productId && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    value={entryForm.quantity}
                    onChange={(event) => {
                      const quantity = event.target.value;
                      const unitPrice = Number(entryForm.unitPrice || "0");
                      const total = Number(quantity || "0") * unitPrice;
                      setEntryForm((prev) => ({ ...prev, quantity, amount: String(total || "") }));
                    }}
                    placeholder="الكمية"
                    className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entryForm.unitPrice}
                    onChange={(event) => {
                      const unitPrice = event.target.value;
                      const quantity = Number(entryForm.quantity || "0");
                      const total = quantity * Number(unitPrice || "0");
                      setEntryForm((prev) => ({ ...prev, unitPrice, amount: String(total || "") }));
                    }}
                    placeholder="سعر الوحدة"
                    className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                  />
                </div>
              )}
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryForm.amount}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="المبلغ"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                required
              />
              <input
                type="date"
                value={entryForm.date}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, date: event.target.value }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                required
              />
              <textarea
                value={entryForm.description}
                onChange={(event) => setEntryForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="وصف العملية"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />

              {paymentPreview && (
                <div className="space-y-1 rounded-xl border border-[#e6e9e3] p-3 text-xs text-[#5f665f]">
                  <p>إجمالي الدين: {formatMoney(paymentPreview.totalDebt, entryForm.currency)}</p>
                  <p>المدفوع سابقا: {formatMoney(paymentPreview.totalPaid, entryForm.currency)}</p>
                  <p>المتبقي: {formatMoney(paymentPreview.remaining, entryForm.currency)}</p>
                  <p>الدفعة الحالية: {formatMoney(paymentPreview.current, entryForm.currency)}</p>
                  <p>المتبقي بعد الدفع: {formatMoney(paymentPreview.after, entryForm.currency)}</p>
                </div>
              )}

              {!editingEntryId && entryForm.type === "debt" && (
                <div className="space-y-2 rounded-xl border border-[#e6e9e3] p-3">
                  <label className="flex items-center gap-2 text-sm text-[#2E4A3B]">
                    <input
                      type="checkbox"
                      checked={entryForm.addReminder}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, addReminder: event.target.checked }))}
                    />
                    إضافة تذكير؟
                  </label>

                  {entryForm.addReminder && (
                    <>
                      <input
                        type="date"
                        value={entryForm.reminderDate}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, reminderDate: event.target.value }))}
                        className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                      />
                      <input
                        type="time"
                        value={entryForm.reminderTime}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, reminderTime: event.target.value }))}
                        className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                      />
                      <input
                        value={entryForm.reminderText}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, reminderText: event.target.value }))}
                        placeholder="نص التذكير"
                        className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                      />
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEntryForm(false)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button type="submit" className="rounded-xl bg-[#2E4A3B] px-3 py-2 text-sm text-white">
                  حفظ
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReminderForm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={(event) => void handleSubmitReminder(event)}
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-[#2E4A3B]">{editingReminderId ? "تعديل تذكير" : "إضافة تذكير"}</h3>
              <select
                value={reminderForm.personId}
                onChange={(event) => setReminderForm((prev) => ({ ...prev, personId: event.target.value }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                required
              >
                <option value="">اختر الشخص</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={reminderForm.dueDate}
                onChange={(event) => setReminderForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
                required
              />
              <input
                type="time"
                value={reminderForm.dueTime}
                onChange={(event) => setReminderForm((prev) => ({ ...prev, dueTime: event.target.value }))}
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <textarea
                value={reminderForm.note}
                onChange={(event) => setReminderForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="نص التذكير"
                className="w-full rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowReminderForm(false)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button type="submit" className="rounded-xl bg-[#2E4A3B] px-3 py-2 text-sm text-white">
                  حفظ
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {personToDelete && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-white p-5"
            >
              <h3 className="mb-3 text-lg font-semibold text-[#2E4A3B]">تأكيد حذف الشخص</h3>
              <p className="mb-5 text-sm leading-6 text-[#5f665f]">
                هل أنت متأكد من حذف [{personToDelete.name}]؟ سيتم حذف جميع عملياته.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPersonToDelete(null)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button onClick={() => void confirmDeletePerson()} className="rounded-xl bg-[#b34738] px-3 py-2 text-sm text-white">
                  حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {entryToDelete && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-5"
            >
              <h3 className="mb-3 text-lg font-semibold text-[#2E4A3B]">تأكيد حذف العملية</h3>
              <p className="mb-5 text-sm text-[#5f665f]">هل أنت متأكد من حذف هذه العملية؟</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEntryToDelete(null)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button onClick={() => void confirmDeleteEntry()} className="rounded-xl bg-[#b34738] px-3 py-2 text-sm text-white">
                  حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reminderToDelete && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-5"
            >
              <h3 className="mb-3 text-lg font-semibold text-[#2E4A3B]">تأكيد حذف التذكير</h3>
              <p className="mb-5 text-sm text-[#5f665f]">هل أنت متأكد من حذف هذا التذكير؟</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setReminderToDelete(null)} className="rounded-xl border border-[#d8ddd5] px-3 py-2 text-sm text-[#687068]">
                  إلغاء
                </button>
                <button onClick={() => void confirmDeleteReminder()} className="rounded-xl bg-[#b34738] px-3 py-2 text-sm text-white">
                  حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}