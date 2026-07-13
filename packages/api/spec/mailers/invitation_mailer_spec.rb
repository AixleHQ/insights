# frozen_string_literal: true

require 'rails_helper'

RSpec.describe InvitationMailer, type: :mailer do
  describe '#invite' do
    let(:organization) { create(:organization, name: 'Test Organization') }
    let(:inviter) { create(:user, name: 'John Smith', email: 'john@example.com') }
    let(:invitation) do
      create(:invitation,
             organization: organization,
             invited_by: inviter,
             email: 'invitee@example.com',
             role: 'member',
             expires_at: 7.days.from_now)
    end

    let(:mail) { described_class.invite(invitation) }

    it 'renders the headers' do
      expect(mail.subject).to eq("You've been invited to join Test Organization on Aixle Insights")
      expect(mail.to).to eq([ 'invitee@example.com' ])
    end

    it 'includes organization name in body' do
      expect(mail.body.encoded).to include('Test Organization')
    end

    it 'includes inviter name in body' do
      expect(mail.body.encoded).to include('John Smith')
    end

    it 'includes accept link in body' do
      expect(mail.body.encoded).to include(invitation.accept_url)
    end

    it 'includes role in body' do
      expect(mail.body.encoded).to include('member')
    end

    it 'includes expiration date in body' do
      expect(mail.body.encoded).to include(invitation.expires_at.strftime('%B'))
    end

    context 'with different roles' do
      let(:owner_invitation) do
        create(:invitation, :owner,
               organization: organization,
               invited_by: inviter,
               email: 'owner@example.com')
      end

      it 'shows owner role' do
        owner_mail = described_class.invite(owner_invitation)
        expect(owner_mail.body.encoded).to include('owner')
      end
    end

    describe 'HTML email' do
      it 'includes styled content' do
        expect(mail.html_part.body.decoded).to include('class="button"')
        expect(mail.html_part.body.decoded).to include('Accept Invitation')
      end

      it 'includes organization logo area' do
        expect(mail.html_part.body.decoded).to include('Aixle Insights')
      end

      it 'is a single well-formed HTML document (no nested layout)' do
        html = mail.html_part.body.decoded

        expect(html.scan(/<!DOCTYPE/i).size).to eq(1)
        expect(html.scan(/<html/i).size).to eq(1)
        expect(html.scan(/<body/i).size).to eq(1)
      end
    end

    describe 'text email' do
      it 'includes plain text content' do
        expect(mail.text_part.body.decoded).to include('Accept your invitation')
        expect(mail.text_part.body.decoded).to include(invitation.accept_url)
      end
    end

    # AIX-468: deliver_later must target the "mailers" queue, which is the
    # only queue Sidekiq is configured to process for mail. If the queue name
    # drifts, invitation emails silently pile up and never send.
    describe 'async delivery queue' do
      it 'enqueues delivery on the "mailers" queue' do
        expect { described_class.invite(invitation).deliver_later }
          .to have_enqueued_job.on_queue('mailers')
      end
    end
  end
end
