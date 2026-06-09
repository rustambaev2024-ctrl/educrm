export type Role = "superadmin" | "director" | "admin" | "branch_admin" | "teacher" | "support_teacher" | "student" | "parent";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  director: "Director",
  admin: "Admin",
  branch_admin: "Branch Admin",
  teacher: "Teacher",
  support_teacher: "Support Teacher",
  student: "Student",
  parent: "Parent",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Platform-level management",
  director: "Institution analytics and operations",
  admin: "Organization operations",
  branch_admin: "Branch operations",
  teacher: "Groups, attendance, homework",
  support_teacher: "Assistant: attendance, homework, grades",
  student: "Schedule, grades, wallet",
  parent: "Children monitoring",
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
