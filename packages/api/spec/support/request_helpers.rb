# frozen_string_literal: true

module RequestHelpers
  def json_response
    JSON.parse(response.body, symbolize_names: true)
  end

  def json_data
    json_response[:data]
  end

  def json_meta
    json_response[:meta]
  end

  def json_errors
    json_response[:errors]
  end

  def json_error
    json_response[:error]
  end

  def expect_success
    expect(response).to have_http_status(:ok)
  end

  def expect_created
    expect(response).to have_http_status(:created)
  end

  def expect_no_content
    expect(response).to have_http_status(:no_content)
  end

  def expect_unauthorized
    expect(response).to have_http_status(:unauthorized)
  end

  def expect_forbidden
    expect(response).to have_http_status(:forbidden)
  end

  def expect_not_found
    expect(response).to have_http_status(:not_found)
  end

  def expect_unprocessable
    expect(response).to have_http_status(:unprocessable_content)
  end

  def expect_bad_request
    expect(response).to have_http_status(:bad_request)
  end

  def expect_paginated_response(total_count: nil, current_page: 1)
    expect(json_response).to have_key(:data)
    expect(json_response).to have_key(:meta)
    expect(json_meta[:currentPage]).to eq(current_page)
    expect(json_meta[:totalCount]).to eq(total_count) if total_count
  end
end

RSpec.configure do |config|
  config.include RequestHelpers, type: :request
end
