from __future__ import annotations

from uuid import uuid4


from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Integer,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (UniqueConstraint("source_type", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    external_ref: Mapped[str | None] = mapped_column(String(500))
    credibility_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    raw_items: Mapped[list["RawItem"]] = relationship(back_populates="source")


class RawItem(Base):
    __tablename__ = "raw_items"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id"),
        UniqueConstraint("content_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"))
    external_id: Mapped[str | None] = mapped_column(String(300))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    title: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text)
    raw_url: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    processing_error: Mapped[str | None] = mapped_column(Text)

    source: Mapped["Source"] = relationship(back_populates="raw_items")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="raw_item")


class Company(Base):
    """Canonical master record for a listed company.

    This table stores relatively stable company identity, classification,
    ownership, and profile information.

    Time-varying information—such as auditors, directors, shareholding,
    financial results, and credit ratings—belongs in separate related tables.
    """

    __tablename__ = "companies"

    # ------------------------------------------------------------------
    # Internal identity
    # ------------------------------------------------------------------

    # Fast internal database key used by relationships and foreign keys.
    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    # Stable public identifier for APIs, exports, and external integrations.
    company_uuid: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        unique=True,
        index=True,
        default=lambda: str(uuid4()),
    )

    # ------------------------------------------------------------------
    # Canonical company and security identity
    # ------------------------------------------------------------------

    # Primary equity ISIN currently associated with the listed company.
    isin: Mapped[str | None] = mapped_column(
        String(12),
        nullable=True,
        unique=True,
        index=True,
    )

    # Full legal name appearing in exchange or regulatory records.
    legal_name: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
        index=True,
    )

    # ------------------------------------------------------------------
    # Exchange identifiers
    # ------------------------------------------------------------------

    nse_symbol: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        unique=True,
        index=True,
    )

    bse_code: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        unique=True,
        index=True,
    )

    bse_security_id: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        unique=True,
        index=True,
    )
    
    # ---------------------------------------------------------
    # NSE listing information
    # ---------------------------------------------------------

    series: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    listing_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    market_lot: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    face_value: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    # ------------------------------------------------------------------
    # Temporary legacy fields
    # ------------------------------------------------------------------
    # Retained during the transition so that existing ingestion code,
    # sample data, CLI commands, and tests continue to work.
    #
    # These fields will be removed after their values have been migrated
    # and the rest of the application uses the new exchange identifiers.

    symbol: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
    )

    exchange: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="NSE",
    )

    # ------------------------------------------------------------------
    # Corporate profile
    # ------------------------------------------------------------------

    # Prefer the company's official website, not an exchange profile page.
    website: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # Concise description of the principal businesses, products,
    # services, markets, and business model.
    business_description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ------------------------------------------------------------------
    # Hierarchical industry classification
    # ------------------------------------------------------------------
    # Example:
    # sector         = Consumer Discretionary
    # industry_group = Automobiles and Components
    # industry       = Automobile Manufacturers
    # sub_industry   = Passenger Vehicles

    sector: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    industry_group: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    industry: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    sub_industry: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    # ------------------------------------------------------------------
    # Headquarters
    # ------------------------------------------------------------------
    # Store the operating headquarters only.
    # Registered offices, branches, and plants should not be stored here.

    headquarters_city: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    headquarters_state: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    headquarters_country: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default="India",
    )

    # ------------------------------------------------------------------
    # Ownership and corporate-group profile
    # ------------------------------------------------------------------

    # Intended controlled values may include:
    # family_promoted
    # professionally_managed
    # multinational_subsidiary
    # government_controlled
    # joint_venture
    # widely_held
    # trust_or_foundation_controlled
    # other
    ownership_type: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
        index=True,
    )

    # Broader corporate group, such as Tata Group or Mahindra Group.
    business_group: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        index=True,
    )

    # Principal promoter or controlling entity.
    promoter_entity: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    # Immediate or ultimate parent company, where applicable.
    parent_company: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # Listing and record status
    # ------------------------------------------------------------------

    # Intended controlled values may include:
    # active, suspended, delisted, merged, acquired, inactive
    listing_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="active",
        index=True,
    )

    # Internal flag indicating whether the record should participate
    # in normal ingestion, processing, screening, and report generation.
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
    )

    # ------------------------------------------------------------------
    # Record audit timestamps
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_item_id: Mapped[int] = mapped_column(ForeignKey("raw_items.id"))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    action: Mapped[str | None] = mapped_column(String(30))
    strategy_horizon: Mapped[str | None] = mapped_column(String(30))
    holding_period_text: Mapped[str | None] = mapped_column(String(100))
    entry_low: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    entry_high: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    target_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    stop_loss: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    thesis_summary: Mapped[str | None] = mapped_column(Text)
    evidence_json: Mapped[str | None] = mapped_column(Text)
    extraction_method: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    raw_item: Mapped["RawItem"] = relationship(back_populates="recommendations")


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_item_id: Mapped[int | None] = mapped_column(ForeignKey("raw_items.id"))
    job_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30))
    model_name: Mapped[str | None] = mapped_column(String(100))
    input_chars: Mapped[int | None]
    output_chars: Mapped[int | None]
    estimated_input_tokens: Mapped[int | None]
    estimated_output_tokens: Mapped[int | None]
    reason_invoked: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Watchlist(Base):
    __tablename__ = "watchlists"
    __table_args__ = (UniqueConstraint("watchlist_date", "stage"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    watchlist_date: Mapped[date] = mapped_column(Date)
    stage: Mapped[str] = mapped_column(String(30))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("watchlist_id", "recommendation_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id"))
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"))
    rank: Mapped[int | None]
    final_confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    validation_summary: Mapped[str | None] = mapped_column(Text)

class ScoreSnapshot(Base):
    __tablename__ = "score_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
    )

    scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    rgs_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    dss_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    tcs_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    mrs_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    state: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    thesis_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    evidence_json: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    model_version: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="v1.0",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

class Thesis(Base):
    __tablename__ = "theses"

    id: Mapped[int] = mapped_column(primary_key=True)

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
    )

    thesis_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
    )

    thesis_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="active",
    )

    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    model_version: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="v1.0",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

class ThesisEvidence(Base):
    __tablename__ = "thesis_evidence"

    id: Mapped[int] = mapped_column(primary_key=True)

    thesis_id: Mapped[int] = mapped_column(
        ForeignKey("theses.id"),
        nullable=False,
    )

    raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    change_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("change_records.id"),
        nullable=True,
        index=True,
    )

    evidence_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    direction: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    summary: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

class ManagementGuidance(Base):
    __tablename__ = "management_guidance"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )

    raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    topic: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    guidance_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    guidance_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    target_value: Mapped[Decimal | None] = mapped_column(
    Numeric(20, 4),
    nullable=True,
    )

    target_rule: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    target_min: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 4),
        nullable=True,
    )

    target_max: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 4),
        nullable=True,
    )

    target_unit: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    target_period: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="open",
    )

    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )


class ManagementOutcome(Base):
    __tablename__ = "management_outcomes"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    guidance_id: Mapped[int] = mapped_column(
        ForeignKey("management_guidance.id"),
        nullable=False,
        index=True,
    )

    raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    actual_value: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 4),
        nullable=True,
    )

    actual_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    outcome_period: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )


class ManagementDeliveryAssessment(Base):
    __tablename__ = "management_delivery_assessments"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    guidance_id: Mapped[int] = mapped_column(
        ForeignKey("management_guidance.id"),
        nullable=False,
        index=True,
    )

    outcome_id: Mapped[int] = mapped_column(
        ForeignKey("management_outcomes.id"),
        nullable=False,
        index=True,
    )

    delivery_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    direction: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    delivery_score: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        nullable=False,
    )

    rationale: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    model_version: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="management-delivery-v1.0",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )    

class ChangeRecord(Base):
    __tablename__ = "change_records"

    id: Mapped[int] = mapped_column(primary_key=True)

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
    )

    raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    change_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    metric_or_topic: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    previous_value: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    current_value: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    change_value: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    direction: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ---------------------------------------------------------
    # Materiality components
    # ---------------------------------------------------------

    magnitude_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    persistence_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    economic_importance_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    novelty_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    evidence_strength_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    specificity_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    css_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    css_model_version: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    materiality_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    materiality_band: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    materiality_model_version: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    comparison_type: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    previous_period: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    current_period: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    first_known_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

class FinancialObservation(Base):
    __tablename__ = "financial_observations"

    id: Mapped[int] = mapped_column(primary_key=True)

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
    )

    raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    metric_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    metric_value: Mapped[Decimal] = mapped_column(
        Numeric(20, 4),
        nullable=False,
    )

    unit: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    period_label: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    period_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    period_end_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    source_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )


class FinancialAdjustment(Base):
    __tablename__ = "financial_adjustments"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    financial_observation_id: Mapped[int] = mapped_column(
        ForeignKey("financial_observations.id"),
        nullable=False,
        index=True,
    )

    source_raw_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_items.id"),
        nullable=True,
    )

    adjustment_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    adjustment_amount: Mapped[Decimal] = mapped_column(
        Numeric(20, 4),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )        

class TCSFactorSnapshot(Base):
    __tablename__ = "tcs_factor_snapshots"

    id: Mapped[int] = mapped_column(
        primary_key=True,
    )

    score_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("score_snapshots.id"),
        nullable=False,
        index=True,
    )

    factor_name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    weight: Mapped[Decimal] = mapped_column(
        Numeric(6, 4),
        nullable=False,
    )

    current_score: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        nullable=False,
    )

    previous_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    delta_score: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )

    model_version: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="tcs-v1.0",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )