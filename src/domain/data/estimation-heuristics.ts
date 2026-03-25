// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// Auto-generated from SPERT_Heuristics_Workbook.xlsx — Master (Combined) tab
// Do not edit manually. Re-generate from the workbook when heuristics are updated.

export interface EstimationHeuristic {
  domain: string;
  subdomain: string;
  minPct: number;  // % of most likely — optimistic bound
  maxPct: number;  // % of most likely — pessimistic bound
  rationale: string;
}

export const ESTIMATION_HEURISTICS: EstimationHeuristic[] = [
  // Aerospace & Defense
  { domain: 'Aerospace & Defense', subdomain: 'Maintenance, Repair & Overhaul', minPct: 80, maxPct: 200, rationale: "Inspection findings during teardown reveal unplanned repairs and parts availability drives schedule variance." },
  { domain: 'Aerospace & Defense', subdomain: 'Routine Avionics Calibration', minPct: 90, maxPct: 120, rationale: "Standardized bench tests follow highly predictable, regulated technical procedures." },
  { domain: 'Aerospace & Defense', subdomain: 'Systems Engineering & Qualification Testing', minPct: 65, maxPct: 350, rationale: "Certification test failures require root-cause analysis and redesign cycles with long requalification lead times." },
  { domain: 'Aerospace & Defense', subdomain: 'UAV / Aerospace Prototyping', minPct: 70, maxPct: 350, rationale: "Complex avionics integration and flight test failures frequently necessitate redesigns." },

  // Change Management
  { domain: 'Change Management', subdomain: 'Digital Transformation Initiative', minPct: 60, maxPct: 350, rationale: "Stakeholder buy-in levels and cultural shift resistance vary across teams." },
  { domain: 'Change Management', subdomain: 'Enterprise Change Management', minPct: 70, maxPct: 275, rationale: "Human adoption rates and leadership alignment strongly influence schedule outcomes." },
  { domain: 'Change Management', subdomain: 'Enterprise Software Rollout & Adoption', minPct: 70, maxPct: 260, rationale: "User training absorption, data migration cleanup, and parallel-run periods expand based on organizational readiness." },
  { domain: 'Change Management', subdomain: 'Organizational Restructuring', minPct: 65, maxPct: 300, rationale: "Stakeholder resistance, communication gaps, and cascading policy revisions make adoption timelines highly volatile." },

  // Construction
  { domain: 'Construction', subdomain: 'Civil & Infrastructure', minPct: 70, maxPct: 275, rationale: "Soil conditions, environmental reviews, and right-of-way acquisitions introduce prolonged uncertainty." },
  { domain: 'Construction', subdomain: 'Commercial Construction', minPct: 80, maxPct: 200, rationale: "Weather delays, permit timelines, and subcontractor scheduling create compounding variance." },
  { domain: 'Construction', subdomain: 'Commercial Fit-Out (Interior)', minPct: 80, maxPct: 180, rationale: "Heavy reliance on sequenced subcontractor performance and material lead times." },
  { domain: 'Construction', subdomain: 'Renovation & Retrofit', minPct: 65, maxPct: 300, rationale: "Hidden structural conditions and code compliance gaps are discovered only after demolition begins." },
  { domain: 'Construction', subdomain: 'Residential Construction', minPct: 80, maxPct: 170, rationale: "Designs are stable but weather, inspections, and subcontractor scheduling affect timelines." },

  // Cybersecurity
  { domain: 'Cybersecurity', subdomain: 'Cybersecurity — Incident Response', minPct: 40, maxPct: 600, rationale: "The scope of the compromise is unknown until full digital forensics are completed." },

  // Data Science & AI
  { domain: 'Data Science & AI', subdomain: 'Basic / Exploratory Research', minPct: 50, maxPct: 500, rationale: "Algorithmic convergence and hypothesis validation are inherently experimental and unpredictable." },
  { domain: 'Data Science & AI', subdomain: 'Data, Analytics & ETL', minPct: 70, maxPct: 260, rationale: "Source data quality issues, schema drift, and edge case handling expand scope as real data is encountered." },
  { domain: 'Data Science & AI', subdomain: 'Machine Learning & Predictive Analytics', minPct: 60, maxPct: 350, rationale: "Model performance against acceptance criteria is uncertain and iteration cycles for feature engineering are open-ended." },

  // Education & Training
  { domain: 'Education & Training', subdomain: 'Curriculum Design & Development', minPct: 75, maxPct: 220, rationale: "Subject matter expert availability and institutional review processes create bottlenecks outside the project team." },
  { domain: 'Education & Training', subdomain: 'Online Course Content Production', minPct: 80, maxPct: 160, rationale: "Talent availability and post-production editing complexity vary by subject matter." },

  // Energy & Utilities
  { domain: 'Energy & Utilities', subdomain: 'Offshore / Complex Energy Installation', minPct: 65, maxPct: 450, rationale: "High sensitivity to narrow weather windows and specialized maritime vessel availability." },
  { domain: 'Energy & Utilities', subdomain: 'Pipeline & Transmission Construction', minPct: 70, maxPct: 280, rationale: "Environmental impact assessments, easement negotiations, and terrain conditions introduce layered regulatory and physical risk." },
  { domain: 'Energy & Utilities', subdomain: 'Power Grid Infrastructure Upgrades', minPct: 85, maxPct: 180, rationale: "Site-specific legacy equipment conditions often differ from original blueprints." },
  { domain: 'Energy & Utilities', subdomain: 'Renewable Energy Installation', minPct: 70, maxPct: 295, rationale: "Permitting timelines, interconnection queue delays, and site condition variability drive schedule risk." },

  // Events & Hospitality
  { domain: 'Events & Hospitality', subdomain: 'Conference & Event Planning', minPct: 70, maxPct: 220, rationale: "Venue availability, vendor coordination, and permitting timelines create hard dependencies with limited float." },

  // Finance & Accounting
  { domain: 'Finance & Accounting', subdomain: 'External Audit', minPct: 80, maxPct: 185, rationale: "Client document availability, sample size escalations, and finding remediation extend fieldwork unpredictably." },
  { domain: 'Finance & Accounting', subdomain: 'Financial Reporting & Close', minPct: 90, maxPct: 130, rationale: "Highly repeatable process with variance driven mainly by reconciliation exceptions and late journal entries." },
  { domain: 'Finance & Accounting', subdomain: 'M&A Due Diligence', minPct: 70, maxPct: 290, rationale: "Hidden financial, legal, or operational issues may emerge during investigation." },
  { domain: 'Finance & Accounting', subdomain: 'Regulatory Compliance Program', minPct: 70, maxPct: 300, rationale: "Evolving regulatory interpretation and multi-jurisdictional requirements cause repeated scope redefinition." },

  // Government & Public Sector
  { domain: 'Government & Public Sector', subdomain: 'Municipal Permitting', minPct: 80, maxPct: 250, rationale: "Backlogs and variable departmental review speeds drive inconsistent turnaround times." },
  { domain: 'Government & Public Sector', subdomain: 'Policy & Legislative Drafting', minPct: 60, maxPct: 375, rationale: "Public comment periods, inter-agency review, and political dynamics create unpredictable delays at each stage." },

  // Healthcare & Life Sciences
  { domain: 'Healthcare & Life Sciences', subdomain: 'Administrative & Operations', minPct: 85, maxPct: 150, rationale: "Structured workflows, process-driven" },
  { domain: 'Healthcare & Life Sciences', subdomain: 'Clinical Trials', minPct: 60, maxPct: 390, rationale: "Patient recruitment timelines, adverse event investigations, and regulatory holds are inherently unpredictable." },
  { domain: 'Healthcare & Life Sciences', subdomain: 'Facility Upgrade', minPct: 80, maxPct: 180, rationale: "Strict regulatory compliance and patient safety protocols constrain scheduling." },
  { domain: 'Healthcare & Life Sciences', subdomain: 'IT & EHR / Hospital System Implementation', minPct: 70, maxPct: 275, rationale: "Clinical workflow integration, staff training resistance, and patient safety validation slow deployments." },
  { domain: 'Healthcare & Life Sciences', subdomain: 'Medical Device Regulatory Approval', minPct: 70, maxPct: 350, rationale: "Regulatory feedback cycles and required design modifications extend timelines in ways that cannot be frontloaded." },

  // Human Resources
  { domain: 'Human Resources', subdomain: 'Recruiting & Staffing', minPct: 70, maxPct: 225, rationale: "Candidate pool quality and hiring manager availability fluctuate." },
  { domain: 'Human Resources', subdomain: 'Training & Development', minPct: 80, maxPct: 200, rationale: "Employee participation rates and skill absorption differ by group." },

  // Information Technology
  { domain: 'Information Technology', subdomain: 'Cybersecurity — Incident Response', minPct: 60, maxPct: 400, rationale: "The root cause and blast radius of incidents are highly uncertain until investigation unfolds." },
  { domain: 'Information Technology', subdomain: 'Cybersecurity — Planning & Compliance', minPct: 60, maxPct: 350, rationale: "Exposure scope unknown upfront" },
  { domain: 'Information Technology', subdomain: 'Data, Analytics & ETL', minPct: 70, maxPct: 290, rationale: "Actual data quality problems and schema mismatches are rarely fully known in advance." },
  { domain: 'Information Technology', subdomain: 'Database Administration & Optimization', minPct: 80, maxPct: 200, rationale: "Query tuning outcomes are predictable in isolation but production data volumes introduce performance surprises." },
  { domain: 'Information Technology', subdomain: 'Infrastructure & DevOps', minPct: 80, maxPct: 190, rationale: "Tasks are well-defined but environment configuration and compatibility issues can introduce delays." },
  { domain: 'Information Technology', subdomain: 'Legacy Modernization & Cloud Migration', minPct: 70, maxPct: 320, rationale: "Dependencies, application compatibility, and network configuration issues frequently appear mid-migration." },
  { domain: 'Information Technology', subdomain: 'QA & Testing', minPct: 75, maxPct: 225, rationale: "Defect volume highly uncertain" },
  { domain: 'Information Technology', subdomain: 'Software Development — Greenfield', minPct: 65, maxPct: 325, rationale: "Novel architecture decisions and emergent requirements frequently cause scope expansion mid-delivery." },
  { domain: 'Information Technology', subdomain: 'Software Development — Maintenance / Enhancement', minPct: 75, maxPct: 215, rationale: "Existing architecture constrains work but hidden technical debt and edge cases can slow delivery." },
  { domain: 'Information Technology', subdomain: 'System Integration & API Development', minPct: 70, maxPct: 260, rationale: "Third-party system behavior, authentication flows, and data format mismatches are discovered only during testing." },

  // Legal
  { domain: 'Legal', subdomain: 'Compliance Audit Preparation', minPct: 70, maxPct: 300, rationale: "Internal document retrieval delays and regulatory interpretation variances." },
  { domain: 'Legal', subdomain: 'Contract Negotiation & Drafting', minPct: 75, maxPct: 210, rationale: "Counterparty responsiveness and redline cycles vary dramatically by deal complexity and relationship dynamics." },
  { domain: 'Legal', subdomain: 'Litigation & Dispute Resolution', minPct: 60, maxPct: 425, rationale: "Discovery scope, opposing counsel tactics, and judicial scheduling are outside the team's control." },

  // Logistics & Supply Chain
  { domain: 'Logistics & Supply Chain', subdomain: 'Supply Chain Optimization', minPct: 75, maxPct: 200, rationale: "Global shipping delays and inventory accuracy issues impact planning." },

  // Manufacturing
  { domain: 'Manufacturing', subdomain: 'Automated Assembly Line Run', minPct: 95, maxPct: 110, rationale: "Fixed machine cycles and established preventative maintenance ensure high predictability." },
  { domain: 'Manufacturing', subdomain: 'Custom Tooling & Fabrication', minPct: 75, maxPct: 250, rationale: "Precision tolerance requirements often require multiple iterative adjustments and hardening." },
  { domain: 'Manufacturing', subdomain: 'Facility Retooling & Line Changeover', minPct: 75, maxPct: 220, rationale: "Equipment compatibility issues and safety re-certifications create sequential delays that compound." },
  { domain: 'Manufacturing', subdomain: 'New Product Development & Tooling', minPct: 65, maxPct: 280, rationale: "First-article failures, tooling rework, and design-for-manufacturability iterations extend initial runs significantly." },
  { domain: 'Manufacturing', subdomain: 'Process Improvement', minPct: 80, maxPct: 175, rationale: "Lean scope, controlled environment" },
  { domain: 'Manufacturing', subdomain: 'Production Line Setup', minPct: 80, maxPct: 160, rationale: "Equipment configuration is predictable but tuning and integration issues can arise." },
  { domain: 'Manufacturing', subdomain: 'Routine Production Run', minPct: 90, maxPct: 130, rationale: "Mature processes with known cycle times vary mainly due to equipment downtime and material supply disruptions." },

  // Marketing & Creative
  { domain: 'Marketing & Creative', subdomain: 'Brand Strategy & Repositioning', minPct: 70, maxPct: 280, rationale: "Stakeholder review cycles and creative direction reversals introduce iterative rework that is difficult to bound." },
  { domain: 'Marketing & Creative', subdomain: 'Campaign Planning & Launch', minPct: 80, maxPct: 170, rationale: "Creative production is structured but stakeholder feedback cycles may extend timelines." },
  { domain: 'Marketing & Creative', subdomain: 'Content Creation & Production', minPct: 70, maxPct: 240, rationale: "Talent scheduling, location logistics, and post-production revision rounds drive wide variance." },
  { domain: 'Marketing & Creative', subdomain: 'Market Research', minPct: 75, maxPct: 200, rationale: "Response rates and data quality" },

  // Pharmaceutical
  { domain: 'Pharmaceutical', subdomain: 'Regulatory Submission', minPct: 55, maxPct: 400, rationale: "Agency feedback loops and supplementary data requests extend review periods." },

  // Procurement
  { domain: 'Procurement', subdomain: 'Capital Equipment Acquisition', minPct: 70, maxPct: 280, rationale: "Lead times for specialized equipment are volatile and customs, shipping, and installation add sequential risk." },
  { domain: 'Procurement', subdomain: 'Standard Vendor Procurement', minPct: 85, maxPct: 160, rationale: "Established sourcing processes are predictable but vendor response times vary." },
  { domain: 'Procurement', subdomain: 'Strategic Sourcing & RFP', minPct: 75, maxPct: 225, rationale: "Vendor response quality, evaluation committee alignment, and contract negotiation rounds extend timelines." },
  { domain: 'Procurement', subdomain: 'Vendor Negotiation', minPct: 80, maxPct: 180, rationale: "Supplier pricing volatility and contract clause disputes extend discussions." },

  // Product Management
  { domain: 'Product Management', subdomain: 'Go-to-Market Planning', minPct: 80, maxPct: 175, rationale: "Structured deliverables, clear owners" },
  { domain: 'Product Management', subdomain: 'Product Discovery & Research', minPct: 65, maxPct: 300, rationale: "Insight depth and pivot risk" },

  // Professional Services
  { domain: 'Professional Services', subdomain: 'Consulting Engagement Delivery', minPct: 80, maxPct: 200, rationale: "Client data availability and executive interview scheduling are the primary constraints." },

  // Research & Development
  { domain: 'Research & Development', subdomain: 'Applied Research & Prototyping', minPct: 60, maxPct: 375, rationale: "Material performance at scale, integration testing failures, and design iteration loops are difficult to forecast." },
  { domain: 'Research & Development', subdomain: 'Basic / Exploratory Research', minPct: 50, maxPct: 500, rationale: "Experimental outcomes are fundamentally uncertain and negative results may require complete methodological pivots." },

  // Retail
  { domain: 'Retail', subdomain: 'Store Renovation', minPct: 70, maxPct: 240, rationale: "Customer traffic patterns and seasonal sales constraints affect execution." },
];

/** Unique sorted domain names */
export const HEURISTIC_DOMAINS: string[] =
  [...new Set(ESTIMATION_HEURISTICS.map(h => h.domain))].sort();

/** Get subdomains for a given domain, sorted */
export function getSubdomains(domain: string): EstimationHeuristic[] {
  return ESTIMATION_HEURISTICS
    .filter(h => h.domain === domain)
    .sort((a, b) => a.subdomain.localeCompare(b.subdomain));
}

/** Look up a specific heuristic */
export function getHeuristic(
  domain: string,
  subdomain: string
): EstimationHeuristic | undefined {
  return ESTIMATION_HEURISTICS.find(
    h => h.domain === domain && h.subdomain === subdomain
  );
}
