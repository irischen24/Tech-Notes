import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton({ variant = "text" }: { variant?: "text" | "outlined" | "tonal" }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant={variant} size="sm">
        <LogOut aria-hidden />
        登出
      </Button>
    </form>
  );
}
