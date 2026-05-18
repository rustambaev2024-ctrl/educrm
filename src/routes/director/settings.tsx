import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Save, Upload, User, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi, branchApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/director/settings")({
  component: DirectorSettingsPage,
});

function DirectorSettingsPage() {
  const { user, refreshUser } = useAuth();
  
  // Institution Settings State
  const [instName, setInstName] = useState("");
  const [instAddress, setInstAddress] = useState("");
  const [instPhone, setInstPhone] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [instLoading, setInstLoading] = useState(false);

  // Profile Settings State
  const [profileName, setProfileName] = useState(user?.fullName ?? "");
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? "");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    loadInstitutionSettings();
  }, []);

  const loadInstitutionSettings = async () => {
    try {
      const data = await branchApi.institutionSettings();
      setInstName(data.name || "");
      setInstAddress(data.address || "");
      setInstPhone(data.phone || "");
      if (data.logo) setLogoPreview(data.logo);
    } catch (err) {
      console.error("Failed to load institution settings", err);
      toast.error("Markaz sozlamalarini yuklashda xatolik yuz berdi");
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveInstitutionSettings = async () => {
    setInstLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", instName);
      formData.append("address", instAddress);
      formData.append("phone", instPhone);
      if (logoFile) {
        formData.append("logo", logoFile);
      }
      
      const data = await branchApi.updateInstitutionSettings(formData);
      if (data.logo) setLogoPreview(data.logo);
      toast.success("Markaz sozlamalari muvaffaqiyatli saqlandi!");
      
      // Reload page to reflect logo changes in UI (sidebar, header)
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error(err);
      toast.error("Markaz sozlamalarini saqlashda xatolik yuz berdi");
    } finally {
      setInstLoading(false);
    }
  };

  const saveProfileSettings = async () => {
    setProfileLoading(true);
    try {
      await authApi.updateMe({ full_name: profileName, phone: profilePhone });
      await refreshUser();
      toast.success("Shaxsiy ma'lumotlar saqlandi! (Login o'zgardi)");
    } catch (err) {
      console.error(err);
      toast.error("Shaxsiy ma'lumotlarni saqlashda xatolik");
    } finally {
      setProfileLoading(false);
    }
  };

  const savePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error("Parollarni kiriting");
      return;
    }
    setPasswordLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      toast.success("Parol muvaffaqiyatli o'zgartirildi!");
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      console.error(err);
      toast.error("Joriy parol noto'g'ri yoki xatolik yuz berdi");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <PageHeader 
        title="Sozlamalar va Personallashtirish" 
        description="O'quv markazi brendini va o'z profilingizni sozlang" 
      />

      <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
        
        {/* Institution Brand Settings */}
        <Card className="shadow-elegant border-border/60">
          <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Building2 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Markaz personallashtirish</CardTitle>
                <CardDescription>O'quvchilar va xodimlar ko'radigan brend ma'lumotlari</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 grid md:grid-cols-[1fr_250px] gap-8">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Markaz nomi</Label>
                <Input 
                  value={instName} 
                  onChange={e => setInstName(e.target.value)} 
                  placeholder="Kelajak Ta'lim" 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Manzil</Label>
                <Input 
                  value={instAddress} 
                  onChange={e => setInstAddress(e.target.value)} 
                  placeholder="Toshkent sh, Chilonzor..." 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Asosiy telefon raqami</Label>
                <Input 
                  value={instPhone} 
                  onChange={e => setInstPhone(e.target.value)} 
                  placeholder="+998 90 123 45 67" 
                />
              </div>
              <Button onClick={saveInstitutionSettings} disabled={instLoading} className="mt-4 shadow-md hover:shadow-lg transition-all">
                <Save className="mr-2 size-4" /> Saqlash
              </Button>
            </div>
            
            <div className="flex flex-col items-center justify-start space-y-4">
              <Label className="text-muted-foreground w-full text-center">Markaz Logotipi</Label>
              <div className="relative group cursor-pointer w-40 h-40 rounded-2xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30 hover:bg-muted/50 transition-colors">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Building2 className="size-10 mb-2 opacity-20" />
                    <span className="text-xs">Logotip yuklash</span>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="size-6 text-white mb-1" />
                  <span className="text-white text-xs font-medium">O'zgartirish</span>
                </div>
                
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleLogoChange}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground max-w-[200px]">
                Kvadrat o'lchamdagi PNG yoki JPG rasm yuklang (maks. 2MB)
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile Settings */}
          <Card className="shadow-elegant border-border/60">
            <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <User className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Shaxsiy ma'lumotlar</CardTitle>
                  <CardDescription>Login sifatida foydalaniladigan telefon raqam</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>F.I.Sh.</Label>
                <Input 
                  value={profileName} 
                  onChange={e => setProfileName(e.target.value)} 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon raqam (Login)</Label>
                <Input 
                  value={profilePhone} 
                  onChange={e => setProfilePhone(e.target.value)} 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ushbu raqam orqali sistemaga kirasiz. O'zgartirsangiz, keyingi safar yangi raqam bilan kirishingiz kerak bo'ladi.
                </p>
              </div>
              <Button onClick={saveProfileSettings} disabled={profileLoading} className="w-full mt-2">
                <Save className="mr-2 size-4" /> Yangilash
              </Button>
            </CardContent>
          </Card>

          {/* Password Settings */}
          <Card className="shadow-elegant border-border/60">
            <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                  <KeyRound className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Parolni o'zgartirish</CardTitle>
                  <CardDescription>Xavfsizlik uchun parolingizni yangilab turing</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Joriy parol</Label>
                <Input 
                  type="password"
                  value={oldPassword} 
                  onChange={e => setOldPassword(e.target.value)} 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Yangi parol</Label>
                <Input 
                  type="password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
              <Button onClick={savePassword} disabled={passwordLoading} variant="outline" className="w-full mt-2">
                <Save className="mr-2 size-4" /> Parolni saqlash
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </>
  );
}
