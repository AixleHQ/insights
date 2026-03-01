output "alb_arn" {
  value = aws_lb.main.arn
}

output "target_group_ids" {
  value = { for name, tg in aws_alb_target_group.main : name => tg.id }
}

output "target_group_arns" {
  value = { for name, tg in aws_alb_target_group.main : name => tg.arn }
}

output "alb_arn_suffix" {
  value = aws_lb.main.arn_suffix
}

output "tg_arn_suffixes" {
  value = { for k, tg in aws_alb_target_group.main : k => tg.arn_suffix }
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}
