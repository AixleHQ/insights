class InvitationMailer < ApplicationMailer
  # TODO: update fallback domain when infrastructure migrates from db90.dev (tracked: AIX-348)
  default from: ENV.fetch("MAILER_FROM", "noreply@db90.dev")

  def invite(invitation)
    @invitation = invitation
    @organization = invitation.organization
    @inviter = invitation.invited_by
    @accept_url = invitation.accept_url
    @expires_at = invitation.expires_at

    mail(
      to: invitation.email,
      subject: "You've been invited to join #{@organization.name} on Aixle Insights"
    )
  end
end
