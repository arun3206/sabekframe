"use client";

import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { PortraitDownloadButton } from "@/features/portrait-flow/components/portrait-download-button";
import styles from "@/app/result/[jobToken]/result.module.css";

export function PortraitResult({ jobToken }: { jobToken: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const imageUrl = `/api/generations/${encodeURIComponent(jobToken)}/${
    unlocked ? "output" : "preview"
  }`;

  return (
    <>
      <div className={`${styles.portrait} ${unlocked ? styles.unlocked : styles.locked}`}>
        <Image
          src={imageUrl}
          alt={unlocked ? "Generated HD portrait" : "Generated portrait preview"}
          fill
          priority
          unoptimized
          sizes="(max-width: 768px) 92vw, 560px"
        />
        {!unlocked ? (
          <div className={styles.previewLock} aria-hidden="true">
            <LockKeyhole />
            <strong>HD portrait ready</strong>
            <span>Unlock to download</span>
          </div>
        ) : null}
      </div>
      <PortraitDownloadButton jobToken={jobToken} onUnlocked={() => setUnlocked(true)} />
    </>
  );
}
