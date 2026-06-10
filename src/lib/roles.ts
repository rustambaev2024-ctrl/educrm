export type Role = "superadmin" | "director" | "admin" | "branch_admin" | "teacher" | "support_teacher" | "student" | "parent";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  director: "Direktor",
  admin: "Administrator",
  branch_admin: "Filial admin",
  teacher: "O'qituvchi",
  support_teacher: "Yordamchi o'qituvchi",
  student: "O'quvchi",
  parent: "Ota-ona",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Platforma boshqaruvi",
  director: "Tahlil va boshqaruv",
  admin: "Tashkilot boshqaruvi",
  branch_admin: "Filial boshqaruvi",
  teacher: "Guruhlar, davomat, uy vazifalari",
  support_teacher: "Davomat, uy vazifalari, baholar",
  student: "Jadval, baholar, hamyon",
  parent: "Farzandlar monitoringi",
};

export const ROLE_HOMES: Record<Role, string> = {
  superadmin: "/superadmin",
  director: "/director",
  admin: "/admin",
  branch_admin: "/admin",
  teacher: "/teacher",
  support_teacher: "/support-teacher",
  student: "/student",
  parent: "/parent",
};
