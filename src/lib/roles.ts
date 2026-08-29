export type Role = "superadmin" | "director" | "branch_admin" | "accountant" | "teacher" | "support_teacher" | "student" | "parent";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  director: "Direktor",
  branch_admin: "Filial admin",
  accountant: "Buxgalter",
  teacher: "O'qituvchi",
  support_teacher: "Yordamchi o'qituvchi",
  student: "O'quvchi",
  parent: "Ota-ona",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Platforma boshqaruvi",
  director: "Tahlil va boshqaruv",
  branch_admin: "Filial boshqaruvi",
  accountant: "Moliya va hisobot",
  teacher: "Guruhlar, davomat, uy vazifalari",
  support_teacher: "Davomat, uy vazifalari, baholar",
  student: "Jadval, baholar, hamyon",
  parent: "Farzandlar monitoringi",
};

export const ROLE_HOMES: Record<Role, string> = {
  superadmin: "/superadmin",
  director: "/director",
  branch_admin: "/admin",
  accountant: "/accountant",
  teacher: "/teacher",
  support_teacher: "/support-teacher",
  student: "/student",
  parent: "/parent",
};
