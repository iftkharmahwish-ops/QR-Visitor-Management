export const dashboardCards = [
  {
    label: "Visitors Registered",
    value: "148",
    caption: "+18 since yesterday",
    icon: "users",
  },
  {
    label: "Pending Approval",
    value: "12",
    caption: "Reception follow-up needed",
    icon: "clock",
  },
  {
    label: "Gate Scans Today",
    value: "121",
    caption: "81.7% check-in completion",
    icon: "activity",
  },
  {
    label: "Risk Alerts",
    value: "03",
    caption: "Pattern monitoring active",
    icon: "alert",
  },
];

export const visitTimeline = [
  { name: "Riya Das", action: "Checked in for design review meeting", time: "09:10 AM" },
  { name: "Akash Verma", action: "Waiting for host approval", time: "09:32 AM" },
  { name: "Neha Joshi", action: "Entered Branch B - Finance Block", time: "10:05 AM" },
  { name: "Rahul Nair", action: "Checked out successfully", time: "11:18 AM" },
];

export const liveVisits = [
  { id: "1", name: "Riya Das", host: "Hosted by Ananya Rao", zone: "Meeting Room 2", status: "Inside" },
  { id: "2", name: "Neha Joshi", host: "Hosted by Arjun Mehta", zone: "Finance Block", status: "Inside" },
  { id: "3", name: "David Roy", host: "Hosted by Security Admin", zone: "Reception Lounge", status: "Awaiting Exit" },
];

export const patternAlerts = [
  {
    title: "Repeat after-hours visits detected",
    description: "One vendor account has requested access three times after 8 PM this week.",
  },
  {
    title: "High frequency branch hopping",
    description: "A visitor profile is appearing across multiple branches in short time intervals.",
  },
];
