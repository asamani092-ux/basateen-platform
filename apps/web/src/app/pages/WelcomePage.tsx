import { Link } from "react-router";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { AlumniStatsCard } from "../components/hub/AlumniStatsCard";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../config/role-access";
import { ds, tajawal } from "../lib/design-system";

export function WelcomePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-8">
      <Card className={ds.card}>
        <CardHeader className="text-center">
          <img
            src="/logo-light.png"
            alt="منصة بساتين"
            className="h-24 mx-auto mb-4 dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt="منصة بساتين"
            className="h-24 mx-auto mb-4 hidden dark:block"
          />
          <CardTitle className="text-2xl" style={tajawal}>
            مرحباً بك في منصة بساتين
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {user && (
            <p className="text-muted-foreground" style={tajawal}>
              {user.full_name_ar}
            </p>
          )}
          <Button asChild className={ds.btnRound} style={tajawal}>
            <Link to={user ? ROLE_HOME[user.role] : "/login"}>
              الذهاب للوحة العمل
            </Link>
          </Button>
        </CardContent>
      </Card>
      <AlumniStatsCard />
    </div>
  );
}
