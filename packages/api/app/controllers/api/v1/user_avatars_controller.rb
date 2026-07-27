# frozen_string_literal: true

module Api
  module V1
    class UserAvatarsController < BaseController
      ALLOWED_AVATAR_CONTENT_TYPES = %w[image/jpeg image/png image/gif image/webp].freeze
      MAX_AVATAR_FILE_SIZE = 5.megabytes

      # POST /api/v1/users/me/avatar
      def create
        authorize! current_user, to: :update?

        unless params[:file].present?
          return render json: { error: I18n.t("errors.user_avatars.file_required") }, status: :unprocessable_content
        end
        unless valid_avatar_file?(params[:file])
          return render json: { error: I18n.t("errors.user_avatars.invalid_file") },
                        status: :unprocessable_content
        end

        current_user.avatar_file.purge if current_user.avatar_file.attached?
        current_user.avatar_file.attach(params[:file])
        current_user.user_settings.load
        render_resource(current_user, UserSerializer)
      end

      # DELETE /api/v1/users/me/avatar
      def destroy
        authorize! current_user, to: :update?

        had_file = current_user.avatar_file.attached?
        current_user.avatar_file.purge if had_file
        current_user.update!(avatar_url: nil) if had_file
        current_user.user_settings.load
        render_resource(current_user, UserSerializer)
      end

      private

      def valid_avatar_file?(file)
        file.content_type.in?(ALLOWED_AVATAR_CONTENT_TYPES) && file.size <= MAX_AVATAR_FILE_SIZE
      end
    end
  end
end
