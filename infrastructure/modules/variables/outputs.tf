output "map" {
  value = [
    for k, v in var.map :
    {
      name  = k
      value = v
    }
  ]
}
