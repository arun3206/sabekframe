"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { StickyBottomAction } from "@/components/layout/sticky-bottom-action";
import { Button } from "@/components/ui/button";
import { StepProgress } from "@/components/ui/step-progress";
import {
  getRelationshipPresentation,
  seasonalCampaign,
  type RelationshipPresentation,
  type SeasonalCampaign,
} from "@/config/relationships";
import {
  getStoredRelationshipSnapshot,
  storeRelationship,
  subscribeToStoredRelationship,
} from "@/features/portrait-flow/storage";
import type { Relationship } from "@/features/portrait-flow/types";
import { analytics } from "@/lib/analytics";
import styles from "./relationship-selection.module.css";

interface RelationshipSelectionProps {
  campaign?: Readonly<SeasonalCampaign>;
}

function RelationshipCard({
  relationship,
  selected,
  onSelect,
}: {
  relationship: RelationshipPresentation;
  selected: boolean;
  onSelect: (relationship: Relationship) => void;
}) {
  return (
    <label
      className={`${styles.relationshipCard} ${
        relationship.isFeatured ? styles.featuredCard : styles.standardCard
      } ${selected ? styles.selectedCard : ""}`}
    >
      <input
        className={styles.radioInput}
        type="radio"
        name="relationship"
        value={relationship.id}
        checked={selected}
        onChange={() => onSelect(relationship.id)}
      />
      <span className={styles.imageFrame}>
        <Image
          src={relationship.image}
          alt={relationship.imageAlt}
          fill
          unoptimized
          priority={relationship.isFeatured}
          sizes={
            relationship.isFeatured
              ? "(max-width: 720px) calc(100vw - 40px), 680px"
              : "(max-width: 359px) calc(100vw - 40px), (max-width: 720px) 45vw, 320px"
          }
          className={styles.relationshipImage}
        />
        {relationship.displayBadge ? (
          <span className={styles.badge}>{relationship.displayBadge}</span>
        ) : null}
      </span>
      <span className={styles.cardContent}>
        <span className={styles.cardCopy}>
          <span className={styles.cardTitle}>{relationship.title}</span>
          <span className={styles.cardDescription}>{relationship.description}</span>
        </span>
        <span
          className={`${styles.selectionMark} ${selected ? styles.selectedMark : ""}`}
          aria-hidden="true"
        >
          {selected ? <Check size={18} strokeWidth={2.5} /> : null}
        </span>
      </span>
    </label>
  );
}

export function RelationshipSelection({
  campaign = seasonalCampaign,
}: RelationshipSelectionProps) {
  const router = useRouter();
  const selectedRelationship = useSyncExternalStore(
    subscribeToStoredRelationship,
    getStoredRelationshipSnapshot,
    () => null,
  );
  const relationshipOptions = useMemo(
    () => getRelationshipPresentation(campaign),
    [campaign],
  );
  const featuredRelationship = relationshipOptions.find(
    (relationship) => relationship.isFeatured,
  );
  const otherRelationships = relationshipOptions.filter(
    (relationship) => !relationship.isFeatured,
  );

  useEffect(() => {
    analytics.track("relationship_page_viewed", {});
  }, []);

  function handleSelect(relationship: Relationship) {
    storeRelationship(window.localStorage, relationship);
    analytics.track("relationship_selected", { relationship });
  }

  function handleContinue() {
    if (!selectedRelationship) {
      return;
    }

    storeRelationship(window.localStorage, selectedRelationship);
    analytics.track("relationship_continue_clicked", {
      relationship: selectedRelationship,
    });
    router.push("/create");
  }

  return (
    <>
      <AppHeader backHref="/" />
      <main className={styles.page}>
        <section className={styles.intro} aria-labelledby="relationship-heading">
          <div className={styles.progressCopy}>Step 1 of 3</div>
          <StepProgress current={1} total={3} />
          <h1 id="relationship-heading">Who would you like to bring together?</h1>
          <p>Choose a relationship and we’ll personalise every step of your portrait.</p>
        </section>

        {campaign.enabled ? (
          <p className={styles.campaignMessage}>{campaign.message}</p>
        ) : null}

        <fieldset className={styles.relationshipGroup}>
          <legend className={styles.visuallyHidden}>Choose one relationship</legend>

          {featuredRelationship ? (
            <RelationshipCard
              relationship={featuredRelationship}
              selected={selectedRelationship === featuredRelationship.id}
              onSelect={handleSelect}
            />
          ) : null}

          {otherRelationships.length > 0 ? (
            <section className={styles.moreRelationships} aria-labelledby="more-heading">
              <h2 id="more-heading">More relationships</h2>
              <div className={styles.relationshipGrid}>
                {otherRelationships.map((relationship) => (
                  <RelationshipCard
                    key={relationship.id}
                    relationship={relationship}
                    selected={selectedRelationship === relationship.id}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </fieldset>
      </main>

      <StickyBottomAction className={styles.stickyAction}>
        <Button
          className={styles.continueButton}
          type="button"
          disabled={!selectedRelationship}
          onClick={handleContinue}
        >
          {selectedRelationship ? "Continue" : "Select a Relationship"}
        </Button>
      </StickyBottomAction>
    </>
  );
}
