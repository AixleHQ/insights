output "self" {
  value = module.vpc
}

output "nat_gateway_eip" {
  value = [for ip in module.vpc.nat_public_ips : "${ip}/32"]
}
