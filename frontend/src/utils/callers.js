// Builds one record per phone from everything already loaded in the app.
export function buildCallerIndex(inquiries = [], complaints = [], appointments = []) {
  const map = new Map();
  const touch = (phone) => {
    if (!phone) return null;
    if (!map.has(phone)) map.set(phone, { phone, name: "", company: "", count: 0, recent: [] });
    return map.get(phone);
  };
  [...inquiries].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)).forEach((i) => {
    const c = touch(i.phone);
    if (!c) return;
    if (!c.name && i.callerName) c.name = i.callerName;
    if (!c.company && i.company) c.company = i.company;
    c.count += 1;
    if (c.recent.length < 3) c.recent.push({ id: i.id, label: i.category, date: (i.dateTime || "").slice(0, 10), status: i.status });
  });
  complaints.forEach((x) => { const c = touch(x.phone); if (c && !c.name && x.callerName) c.name = x.callerName; });
  appointments.forEach((a) => {
    const c = touch(a.phone);
    if (c) { if (!c.name && a.visitorName) c.name = a.visitorName; if (!c.company && a.company) c.company = a.company; }
  });
  return map;
}

export const callerList = (index) => [...index.values()].sort((a, b) => b.count - a.count);
