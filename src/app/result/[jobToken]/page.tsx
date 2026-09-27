import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { Card } from "@/components/ui/card";
import { PortraitResult } from "@/features/portrait-flow/components/portrait-result";
import styles from "./result.module.css";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ jobToken: string }>;
}) {
  const { jobToken } = await params;
  return (
    <MobilePageContainer>
      <Card className={styles.card}>
        <p className="eyebrow">Your portrait preview</p>
        <h1>Your portrait is ready</h1>
        <p className="muted">Preview it below, then unlock the HD portrait you love.</p>
        <PortraitResult jobToken={jobToken} />
        <p className="muted">Your generated portrait is stored privately.</p>
      </Card>
    </MobilePageContainer>
  );
}
