import Image from "next/image";
import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { Card } from "@/components/ui/card";
import { PortraitDownloadButton } from "@/features/portrait-flow/components/portrait-download-button";
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
        <p className="eyebrow">Your festive memory</p>
        <h1>Your portrait is ready</h1>
        <div className={styles.portrait}>
          <Image
            src={`/api/generations/${encodeURIComponent(jobToken)}/output`}
            alt="Generated festive family portrait"
            fill
            priority
            unoptimized
            sizes="(max-width: 768px) 92vw, 560px"
          />
        </div>
        <PortraitDownloadButton
          imageUrl={`/api/generations/${encodeURIComponent(jobToken)}/output`}
        />
        <p className="muted">Your generated portrait is stored privately.</p>
      </Card>
    </MobilePageContainer>
  );
}
