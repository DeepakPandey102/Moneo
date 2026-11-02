// Categories used across the app.
// `icon` refers to a lucide-react icon name (resolved in CategoryIcon).
//
// Expense and income categories are separate: spending goes to Food,
// Transport, …; money coming in comes from a Job, Business, Investment, …
// Budgets and spending charts only use the expense list.

export const CATEGORIES = [
  { id: "food", en: "Food & Dining", ko: "식비", color: "#F59E0B", icon: "UtensilsCrossed" },
  { id: "transport", en: "Transport", ko: "교통", color: "#38BDF8", icon: "Bus" },
  { id: "shopping", en: "Shopping", ko: "쇼핑", color: "#60A5FA", icon: "ShoppingBag" },
  { id: "entertainment", en: "Entertainment", ko: "엔터테인먼트", color: "#C084FC", icon: "Popcorn" },
  { id: "bills", en: "Bills", ko: "공과금", color: "#F87171", icon: "Receipt" },
  { id: "education", en: "Education", ko: "교육", color: "#2DD4BF", icon: "GraduationCap" },
  { id: "health", en: "Health", ko: "건강", color: "#F472B6", icon: "HeartPulse" },
  { id: "travel", en: "Travel", ko: "여행", color: "#818CF8", icon: "Plane" },
  { id: "other", en: "Other", ko: "기타", color: "#94A3B8", icon: "MoreHorizontal" },
];

export const INCOME_CATEGORIES = [
  { id: "salary", en: "Job / Salary", ko: "급여", color: "#34D399", icon: "Briefcase", income: true },
  { id: "business", en: "Business", ko: "사업", color: "#22D3EE", icon: "Store", income: true },
  { id: "investment", en: "Investment", ko: "투자", color: "#A78BFA", icon: "TrendingUp", income: true },
  { id: "freelance", en: "Side job / Freelance", ko: "부업 · 프리랜서", color: "#60A5FA", icon: "Laptop", income: true },
  { id: "allowance", en: "Allowance & gifts", ko: "용돈 · 선물", color: "#F472B6", icon: "Gift", income: true },
  { id: "scholarship", en: "Scholarship", ko: "장학금", color: "#FBBF24", icon: "GraduationCap", income: true },
  { id: "other_income", en: "Other income", ko: "기타 수입", color: "#94A3B8", icon: "CircleDollarSign", income: true },
];

export const ALL_CATEGORIES = [...CATEGORIES, ...INCOME_CATEGORIES];

// The list to offer for a transaction type ("expense" or "income").
export function categoriesFor(type) {
  return type === "income" ? INCOME_CATEGORIES : CATEGORIES;
}

// Default category when the type changes in a form.
export function defaultCategory(type) {
  return type === "income" ? "salary" : "food";
}

export const PAYMENT_METHODS = ["Card", "Cash", "Transfer", "Other"];

export function categoryById(id) {
  return ALL_CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export function categoryLabel(id, lang) {
  const c = categoryById(id);
  return lang === "ko" ? c.ko : c.en;
}
