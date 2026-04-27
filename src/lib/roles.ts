export type Role = "superadmin" | "director" | "admin" | "teacher" | "student" | "parent";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  director: "Director",
  admin: "Branch Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Platform-level management",
  director: "Institution analytics and operations",
  admin: "Branch operations",
  teacher: "Groups, attendance, homework",
  student: "Schedule, grades, wallet",
  parent: "Children monitoring",
};

export const ROLE_HOMES: Record<Role, string> = {
  superadmin: "/superadmin",
  director: "/director",
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
  parent: "/parent",
};
