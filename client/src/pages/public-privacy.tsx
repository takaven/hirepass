import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PublicBrand, type PublicConfig } from "./public-apply";

function configured(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2">{children}</ul>;
}

export default function PublicPrivacy() {
  const { data: config } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });
  const companyName = configured(config?.companyName, "the hiring organisation");
  const companyLocation = configured(config?.companyLocation, "Not configured");
  const careersContactEmail = configured(config?.careersContactEmail, "Not configured");
  const noticeVersion = configured(config?.privacyNoticeVersion, "configured by the hiring organisation");

  return (
    <main className="min-h-screen ios-gradient-bg px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <PublicBrand config={config} />

        <GlassCard className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Recruitment Privacy Notice</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Recruitment Privacy Notice</h1>
              <p className="mt-3 text-sm text-muted-foreground">Notice version: {noticeVersion}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="space-y-8 p-6 text-sm leading-7 text-muted-foreground sm:p-8">
          <div className="space-y-4">
            <p>
              This Recruitment Privacy Notice explains how <strong className="font-semibold text-foreground">{companyName}</strong>{" "}
              collects, uses, stores and protects personal information when you apply for a role, submit your CV for
              consideration for future opportunities, or otherwise take part in a recruitment process managed through
              HirePass.
            </p>
            <p>
              It also explains how your information may be used within the Candidate Library and, where enabled, how
              artificial intelligence may assist the recruitment process.
            </p>
            <p>
              HirePass is the technology used to support the recruitment process. The organisation named above remains
              responsible for its recruitment decisions.
            </p>
          </div>

          <Section title="1. Who is responsible for your personal information?">
            <p>
              <strong className="font-semibold text-foreground">{companyName}</strong> is the organisation responsible
              for determining how your personal information is used for its recruitment activities.
            </p>
            <p>Where configured:</p>
            <p><strong className="font-semibold text-foreground">Location:</strong> {companyLocation}</p>
            <p>
              <strong className="font-semibold text-foreground">Recruitment contact:</strong>{" "}
              {config?.careersContactEmail ? (
                <a className="font-medium text-primary underline underline-offset-4" href={`mailto:${config.careersContactEmail}`}>
                  {careersContactEmail}
                </a>
              ) : careersContactEmail}
            </p>
            <p>
              For questions about how your recruitment information is used, or to exercise an applicable data-protection
              right, please contact the recruitment contact shown above.
            </p>
          </Section>

          <Section title="2. What information may we collect?">
            <p>The information we collect depends on how you interact with us and the stage of the recruitment process.</p>
            <p>It may include:</p>
            <BulletList>
              <li>your name, email address, telephone number and other contact details;</li>
              <li>your CV, résumé or professional profile;</li>
              <li>employment history and previous roles;</li>
              <li>education, qualifications, certifications and training;</li>
              <li>skills, experience and professional achievements;</li>
              <li>information you provide in an application form;</li>
              <li>information relevant to your eligibility or suitability for a particular role;</li>
              <li>interview availability, interview records and interview-related information;</li>
              <li>assessments, questions and responses used during recruitment;</li>
              <li>hiring-team or stakeholder feedback relating to your application;</li>
              <li>documents you voluntarily provide or that are reasonably requested as part of the recruitment process;</li>
              <li>communications between you and the hiring organisation;</li>
              <li>recruitment stages, actions, decisions and related workflow records;</li>
              <li>offer-related information where applicable;</li>
              <li>information concerning your interactions with Candidate Passes or other recruitment features;</li>
              <li>technical, security and audit information generated through use of the recruitment service; and</li>
              <li>
                where AI-assisted features are enabled, analysis generated from information contained in your application
                materials and the criteria established for a role.
              </li>
            </BulletList>
            <p>Please avoid providing sensitive or special-category personal information unless it is genuinely relevant to the recruitment process and has been specifically requested.</p>
            <p>Where special-category personal information is processed, it should only be processed where permitted by applicable law and with appropriate safeguards.</p>
          </Section>

          <Section title="3. Where does the information come from?">
            <p>Most recruitment information is collected directly from you when you:</p>
            <BulletList>
              <li>apply for a vacancy;</li>
              <li>submit your CV to the Candidate Library or talent pool;</li>
              <li>complete a recruitment form;</li>
              <li>communicate with the hiring team;</li>
              <li>attend or arrange an interview;</li>
              <li>provide a requested document;</li>
              <li>respond to an offer; or</li>
              <li>otherwise participate in the recruitment process.</li>
            </BulletList>
            <p>We may also receive relevant information from other legitimate sources, such as:</p>
            <BulletList>
              <li>authorised hiring stakeholders;</li>
              <li>interviewers or reviewers;</li>
              <li>referees where references are requested;</li>
              <li>recruitment representatives acting on behalf of the hiring organisation; or</li>
              <li>other sources where you have authorised the collection or the information may lawfully be obtained.</li>
            </BulletList>
            <p>Where personal information is not obtained directly from you, information about its source will be provided where required by applicable law.</p>
          </Section>

          <Section title="4. Why do we use your information?">
            <p>We may use recruitment information to:</p>
            <BulletList>
              <li>receive and manage applications;</li>
              <li>create and maintain your candidate profile;</li>
              <li>assess applications against the requirements of a role;</li>
              <li>communicate with you about your application;</li>
              <li>organise and manage interviews;</li>
              <li>allow authorised hiring stakeholders to review information and provide relevant input;</li>
              <li>request and manage recruitment-related documents;</li>
              <li>prepare and manage offers;</li>
              <li>record recruitment decisions and relevant supporting information;</li>
              <li>operate the Candidate Library;</li>
              <li>consider candidates for suitable future opportunities;</li>
              <li>maintain appropriate records of recruitment activity;</li>
              <li>improve the organisation and administration of recruitment processes;</li>
              <li>protect the security and integrity of the recruitment service;</li>
              <li>investigate misuse or security incidents;</li>
              <li>establish, exercise or defend legal rights; and</li>
              <li>comply with applicable legal, regulatory or record-keeping obligations.</li>
            </BulletList>
            <p>Personal information will not be used for purposes that are incompatible with the purposes for which it was collected unless such further processing is permitted or required by law.</p>
          </Section>

          <Section title="5. What is the lawful basis for processing?">
            <p>The lawful basis for processing may depend on the particular recruitment activity.</p>
            <p>Depending on the circumstances, personal information may be processed because:</p>
            <BulletList>
              <li>you have asked us to take steps in connection with a potential employment relationship;</li>
              <li>processing is necessary for the legitimate interests of the hiring organisation in recruiting and selecting suitable people, provided those interests do not improperly override your rights and interests;</li>
              <li>processing is necessary to comply with a legal obligation;</li>
              <li>processing is necessary to establish, exercise or defend legal rights; or</li>
              <li>you have provided consent for a particular activity where consent is the appropriate lawful basis.</li>
            </BulletList>
            <p>Where processing relies on your consent, you may withdraw that consent at any time.</p>
            <p>Withdrawal of consent does not affect the lawfulness of processing that took place before the withdrawal.</p>
            <p>Withdrawal of consent may also not require deletion of information where another lawful ground permits or requires continued processing.</p>
          </Section>

          <Section title="6. Candidate Library and future opportunities">
            <p>HirePass maintains a Candidate Library so that the hiring organisation can manage candidate information efficiently and avoid requiring the same information to be submitted repeatedly.</p>
            <p>When you apply for a vacancy or submit your CV generally, a candidate profile may be created or updated in the Candidate Library.</p>
            <p>Your Candidate Library profile may include:</p>
            <BulletList>
              <li>your contact information;</li>
              <li>your current CV;</li>
              <li>previous applications;</li>
              <li>recruitment history;</li>
              <li>relevant hiring outcomes; and</li>
              <li>other recruitment-related information associated with your profile.</li>
            </BulletList>
            <p>Being stored in the Candidate Library does <strong className="font-semibold text-foreground">not</strong> mean that you have applied for every vacancy.</p>
            <p>Where the hiring organisation considers that your profile may be relevant to another vacancy, HirePass may help authorised hiring users identify that potential match.</p>
            <p>You are not automatically selected for, rejected from, or progressed through another vacancy merely because HirePass identifies a possible match.</p>
            <p>An authorised person remains responsible for deciding what action, if any, should be taken.</p>
            <p>You may contact the hiring organisation if you no longer wish your profile to be considered for future opportunities, subject to any information the organisation is lawfully required or entitled to retain.</p>
          </Section>

          <Section title="7. AI-assisted recruitment">
            <p>Where enabled by the hiring organisation, HirePass may use artificial intelligence to assist authorised hiring users.</p>
            <p>AI-assisted features may help to:</p>
            <BulletList>
              <li>identify evidence contained in a CV or application against criteria established for a vacancy;</li>
              <li>identify criteria for which supporting evidence has not been found;</li>
              <li>highlight relevant strengths or material information gaps;</li>
              <li>suggest areas that may require clarification;</li>
              <li>assist authorised users in comparing existing application evidence;</li>
              <li>identify potentially relevant candidates already held in the Candidate Library; and</li>
              <li>suggest questions that may be useful during an interview.</li>
            </BulletList>
            <h3 className="text-base font-semibold text-foreground">How the AI works at a high level</h3>
            <p>The AI is provided with relevant recruitment information, such as role requirements, criteria confirmed by the hiring organisation and information contained in candidate application materials.</p>
            <p>It analyses that information and produces structured assistance for authorised hiring users.</p>
            <p>The output may include references to evidence, identified gaps, summaries or suggested questions.</p>
            <p>AI-generated information may be incomplete or inaccurate and should therefore be reviewed by an authorised person.</p>
            <h3 className="text-base font-semibold text-foreground">AI does not make the hiring decision</h3>
            <p><strong className="font-semibold text-foreground">AI analyses. Humans decide.</strong></p>
            <p>HirePass is not intended to make final hiring or rejection decisions solely through automated processing.</p>
            <p>AI does not automatically:</p>
            <BulletList>
              <li>hire a candidate;</li>
              <li>reject a candidate;</li>
              <li>determine the final recruitment outcome; or</li>
              <li>replace the responsibility of authorised hiring decision-makers.</li>
            </BulletList>
            <p>An authorised person remains responsible for decisions affecting your application.</p>
            <p>HirePass is designed so that protected or sensitive personal characteristics are not used as recruitment criteria by the AI-assisted review process, and the AI should not infer such characteristics for recruitment decision-making.</p>
            <p>If you have concerns about AI-assisted processing of your application, you may contact the hiring organisation using the contact information provided in this notice.</p>
          </Section>

          <Section title="8. Is providing information mandatory?">
            <p>Certain information is necessary for the hiring organisation to process an application.</p>
            <p>Fields identified as required must generally be completed if you wish to submit that application.</p>
            <p>Other information may be voluntary.</p>
            <p>If information that is necessary to assess or administer an application is not provided, the hiring organisation may be unable to process or continue with the application.</p>
            <p>Submitting information for general future consideration rather than for a specific vacancy is voluntary.</p>
          </Section>

          <Section title="9. Who may receive or access your information?">
            <p>Recruitment information may be accessed or disclosed where reasonably necessary to:</p>
            <BulletList>
              <li>authorised members of the hiring or HR team;</li>
              <li>hiring managers;</li>
              <li>interviewers;</li>
              <li>authorised reviewers;</li>
              <li>authorised decision-makers;</li>
              <li>relevant internal stakeholders participating in the recruitment process;</li>
              <li>technology, hosting, communications, security or AI service providers acting in support of the recruitment service;</li>
              <li>professional advisers where reasonably necessary; and</li>
              <li>public authorities, regulators, courts or other persons where disclosure is required or permitted by law.</li>
            </BulletList>
            <p>Access should be limited to information reasonably necessary for the person&apos;s role in the recruitment process.</p>
            <p>Candidate Passes and Stakeholder Passes are intended to provide scoped access to relevant recruitment information and actions.</p>
            <p>We do not sell candidate personal information.</p>
          </Section>

          <Section title="10. International processing and transfers">
            <p>HirePass and the hiring organisation may use technology and service providers whose systems or personnel are located outside Mauritius.</p>
            <p>This may include providers supporting:</p>
            <BulletList>
              <li>application hosting;</li>
              <li>data storage;</li>
              <li>email communications;</li>
              <li>security; and</li>
              <li>AI-assisted processing.</li>
            </BulletList>
            <p>Where personal information is transferred to or processed in another country, the hiring organisation is responsible for ensuring that the transfer is carried out in accordance with applicable data-protection requirements.</p>
            <p>Where required, appropriate safeguards or another lawful transfer mechanism should be used.</p>
            <p>The precise providers, processing locations and safeguards may depend on the services configured for the hiring organisation.</p>
            <p>You may contact the hiring organisation for further information about international processing relevant to your recruitment information.</p>
          </Section>

          <Section title="11. How long do we keep recruitment information?">
            <p>Recruitment information will be retained only for as long as reasonably necessary for the purposes for which it is processed.</p>
            <p>The appropriate retention period may depend on factors including:</p>
            <BulletList>
              <li>whether a recruitment process is still active;</li>
              <li>the stage and outcome of an application;</li>
              <li>whether your profile remains reasonably relevant for suitable future opportunities;</li>
              <li>whether you have asked not to be considered for future opportunities;</li>
              <li>legal or regulatory record-keeping requirements;</li>
              <li>the need to establish, exercise or defend legal rights; and</li>
              <li>applicable internal retention requirements of the hiring organisation.</li>
            </BulletList>
            <p>Candidate Library records should be reviewed and should be deleted or anonymised when they are no longer reasonably required, subject to applicable legal obligations or other lawful grounds for retention.</p>
            <p>This notice does not promise a fixed retention period where no fixed period has been established by the hiring organisation.</p>
            <p>You may contact the hiring organisation for information about the retention criteria applicable to your information.</p>
          </Section>

          <Section title="12. Your data-protection rights">
            <p>Subject to applicable law and any relevant exemptions, you may have the right to:</p>
            <BulletList>
              <li>ask whether personal information about you is being processed;</li>
              <li>request access to personal information held about you;</li>
              <li>request correction of inaccurate or incomplete information;</li>
              <li>request deletion of personal information where the conditions for deletion are met;</li>
              <li>request restriction of processing in appropriate circumstances;</li>
              <li>object to certain processing;</li>
              <li>withdraw consent where processing is based on consent;</li>
              <li>receive information about the purposes for which your information is processed;</li>
              <li>receive information about categories of recipients;</li>
              <li>receive information about applicable retention periods or the criteria used to determine them;</li>
              <li>receive information about relevant automated processing; and</li>
              <li>raise a complaint concerning the processing of your personal information.</li>
            </BulletList>
            <p>You also have the right, subject to applicable law, not to be subject to a decision based solely on automated processing, including profiling, where that decision produces legal effects concerning you or otherwise significantly affects you.</p>
            <p>Because HirePass is designed to support human recruitment decisions rather than replace them, final recruitment decisions remain the responsibility of authorised people.</p>
            <p>To exercise an applicable right, contact:</p>
            <p><strong className="font-semibold text-foreground">{careersContactEmail}</strong></p>
            <p>We may need to take reasonable steps to verify your identity before responding to a request.</p>
          </Section>

          <Section title="13. Complaints">
            <p>If you have a concern about how your recruitment information has been handled, please contact <strong className="font-semibold text-foreground">{companyName}</strong> first using the recruitment contact provided above.</p>
            <p>If you believe your rights under the Mauritius Data Protection Act 2017 have been infringed, you may also lodge a complaint with the:</p>
            <p>
              <strong className="font-semibold text-foreground">Data Protection Commissioner</strong><br />
              Data Protection Office<br />
              5th Floor, SICOM Tower<br />
              Wall Street<br />
              Ebène<br />
              Mauritius
            </p>
            <p>Information about the Data Protection Office and its complaint process is available from the official Data Protection Office of Mauritius.</p>
          </Section>

          <Section title="14. Security">
            <p>Reasonable technical and organisational measures should be used to protect recruitment information against:</p>
            <BulletList>
              <li>unauthorised access;</li>
              <li>unlawful disclosure;</li>
              <li>accidental loss;</li>
              <li>alteration;</li>
              <li>destruction; and</li>
              <li>misuse.</li>
            </BulletList>
            <p>Access to recruitment information should be limited to authorised persons who require it for legitimate recruitment activities.</p>
            <p>HirePass includes controls intended to limit access to internal recruitment users and to scope external Candidate and Stakeholder Pass access.</p>
            <p>No internet-based service can guarantee absolute security, and users should also take appropriate care when accessing recruitment links or providing personal information online.</p>
          </Section>

          <Section title="15. Technical and security information">
            <p>When you use HirePass, limited technical information may be processed where necessary to:</p>
            <BulletList>
              <li>operate the service;</li>
              <li>maintain session and access security;</li>
              <li>prevent abuse;</li>
              <li>investigate errors;</li>
              <li>maintain system integrity; and</li>
              <li>keep appropriate security or audit records.</li>
            </BulletList>
            <p>HirePass is not intended to use recruitment information for advertising profiling.</p>
            <p>Technical information should not be retained for longer than reasonably necessary for its operational, security or legal purpose.</p>
          </Section>

          <Section title="16. Accuracy of your information">
            <p>Please provide information that is accurate and reasonably up to date.</p>
            <p>If information you have provided becomes inaccurate during an active recruitment process, you may contact the hiring organisation to request that it be corrected.</p>
            <p>The hiring organisation should take reasonable steps to correct or update inaccurate personal information where appropriate.</p>
          </Section>

          <Section title="17. Changes to this notice">
            <p>This notice may be updated when:</p>
            <BulletList>
              <li>recruitment practices change;</li>
              <li>HirePass functionality materially changes;</li>
              <li>configured service providers change;</li>
              <li>data-processing arrangements change; or</li>
              <li>applicable legal requirements change.</li>
            </BulletList>
            <p>Where a change materially affects how candidate information is processed, the hiring organisation should consider whether candidates need to be informed of the updated notice.</p>
            <p>HirePass records the applicable privacy-notice version associated with candidate submissions so that the hiring organisation can identify which notice was presented at the relevant time.</p>
          </Section>

          <Section title="18. Contact">
            <p>For questions about this notice, your recruitment information or an applicable data-protection right, contact:</p>
            <p><strong className="font-semibold text-foreground">{companyName}</strong></p>
            <p><strong className="font-semibold text-foreground">{companyLocation}</strong></p>
            <p><strong className="font-semibold text-foreground">{careersContactEmail}</strong></p>
          </Section>

          <div className="border-t pt-6">
            <p><strong className="font-semibold text-foreground">Notice version:</strong> {noticeVersion}</p>
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
